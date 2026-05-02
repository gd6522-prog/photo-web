import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { json, requireAdmin } from "../notices/_shared";
import { getR2ObjectBuffer, listR2Keys } from "@/lib/r2";

export const runtime = "nodejs";

const PREFIX = "file-uploads/logistics-cost-by-store/";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdFromKey(key: string): string | null {
  const m = key.match(/_(\d{8})_\d{6}\.xlsx?$/);
  if (!m) return null;
  const d = m[1];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  let body: { from?: string; to?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  if (!isValidDate(from) || !isValidDate(to)) {
    return json(false, "from/to 는 YYYY-MM-DD 형식이어야 합니다.", null, 400);
  }
  if (from > to) {
    return json(false, "시작일이 종료일보다 늦을 수 없습니다.", null, 400);
  }

  try {
    const keys = await listR2Keys(PREFIX);

    // 같은 날짜에 여러 파일이 있으면 가장 최신(파일명 사전순 큰 것)만 사용
    const byDate = new Map<string, string>();
    for (const key of keys) {
      const fileName = key.replace(PREFIX, "");
      if (fileName.startsWith("_") || fileName.endsWith(".meta")) continue;
      const ymd = ymdFromKey(key);
      if (!ymd) continue;
      if (ymd < from || ymd > to) continue;
      const cur = byDate.get(ymd);
      if (!cur || fileName > cur.replace(PREFIX, "")) byDate.set(ymd, key);
    }

    const sortedDates = [...byDate.keys()].sort();
    if (sortedDates.length === 0) {
      return json(false, "선택한 기간에 파일이 없습니다.", null, 404);
    }

    // 첫 파일에서 헤더 추출 + 모든 파일의 데이터 행 누적
    let header: unknown[][] | null = null;
    const allRows: unknown[][] = [];
    const sheetName = "기간합산";

    for (const ymd of sortedDates) {
      const key = byDate.get(ymd)!;
      const buf = await getR2ObjectBuffer(key);
      if (!buf) continue;
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) continue;
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
      if (aoa.length === 0) continue;
      if (!header) {
        header = [aoa[0]];
        allRows.push(...aoa.slice(1));
      } else {
        allRows.push(...aoa.slice(1));
      }
    }

    if (!header) {
      return json(false, "파일을 읽지 못했습니다.", null, 500);
    }

    // 합산 시트 생성
    const mergedAoa: unknown[][] = [...header, ...allRows];
    const newWs = XLSX.utils.aoa_to_sheet(mergedAoa);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, sheetName);

    const out = XLSX.write(newWb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fileName = `물류비조회_작업구분별_합산_${from.replace(/-/g, "")}-${to.replace(/-/g, "")}.xlsx`;

    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Merged-Days": String(sortedDates.length),
        "X-Merged-Rows": String(allRows.length),
      },
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
