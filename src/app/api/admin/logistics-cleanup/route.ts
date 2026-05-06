import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { json, requireAdmin } from "../notices/_shared";
import { deleteR2Object, getR2ObjectBuffer, listR2Keys, putR2Object } from "@/lib/r2";

export const runtime = "nodejs";

const PREFIX = "file-uploads/logistics-cost-by-store/";
const XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function normalizeDateValue(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return s;
}

export async function POST(req: NextRequest) {
  // service role bearer 도 허용 (CLI 일괄 정리 작업)
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY && token === process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isServiceRole) {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) {
    return json(false, "confirm:true 가 필요합니다.", null, 400);
  }

  try {
    const keys = await listR2Keys(PREFIX);
    const keep0501 = keys.find((k) => /\/물류비조회_작업구분별_20260501_\d{6}\.xlsx?$/.test(k));
    const keep0423 = keys.find((k) => /\/물류비조회_작업구분별_20260423_\d{6}\.xlsx?$/.test(k));

    const result: Record<string, unknown> = {};

    // (A) 0423 파일 삭제
    if (keep0423) {
      await deleteR2Object(keep0423);
      result.deleted_0423 = keep0423;
    } else {
      result.deleted_0423 = null;
    }

    // (B) 0501 파일 → 5/1 데이터만 추출하여 같은 키로 덮어쓰기
    if (keep0501) {
      const buf = await getR2ObjectBuffer(keep0501);
      if (!buf) {
        result.filter_0501 = "원본 파일 다운로드 실패";
        return json(true, undefined, result);
      }
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        result.filter_0501 = "시트 없음";
        return json(true, undefined, result);
      }
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
      if (aoa.length < 2) {
        result.filter_0501 = "데이터 없음";
        return json(true, undefined, result);
      }
      const headers = (aoa[0] ?? []).map((c) => String(c ?? ""));
      const normHeaders = headers.map(normalizeHeader);
      const dateIdx = normHeaders.indexOf(normalizeHeader("납품예정일"));
      if (dateIdx < 0) {
        result.filter_0501 = "납품예정일 컬럼을 못 찾음";
        return json(true, undefined, result);
      }

      const filtered: unknown[][] = [aoa[0]];
      let kept = 0;
      let dropped = 0;
      for (let i = 1; i < aoa.length; i++) {
        const v = normalizeDateValue(aoa[i][dateIdx]);
        if (v === "2026-05-01") {
          filtered.push(aoa[i]);
          kept += 1;
        } else {
          dropped += 1;
        }
      }

      const newWs = XLSX.utils.aoa_to_sheet(filtered);
      const newWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWb, newWs, wb.SheetNames[0] || "Sheet1");
      const out = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" }) as Buffer;

      // 같은 키에 그대로 PUT (덮어쓰기)
      await putR2Object(keep0501, out, XLSX_CT);
      result.filter_0501 = { key: keep0501, kept_rows: kept, dropped_rows: dropped, new_size_kb: Math.round(out.length / 1024) };
    } else {
      result.filter_0501 = "0501 파일 없음";
    }

    return json(true, undefined, result);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
