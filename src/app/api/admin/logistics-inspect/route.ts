import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { json, requireAdmin } from "../notices/_shared";
import { getR2ObjectBuffer, listR2Keys } from "@/lib/r2";

export const runtime = "nodejs";

const PREFIX = "file-uploads/logistics-cost-by-store/";

function ymdFromKey(key: string): string | null {
  const m = key.match(/_(\d{8})_\d{6}\.xlsx?$/);
  if (!m) return null;
  const d = m[1];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

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
  const num = Number(s);
  if (Number.isFinite(num) && num > 25569 && num < 80000) {
    const ms = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY && token === process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isServiceRole) {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;
  }

  try {
    const keys = await listR2Keys(PREFIX);
    const files = keys.filter((k) => /\.xlsx?$/.test(k)).sort();

    type FileSummary = {
      fileName: string;
      filenameDate: string | null;
      rowCount: number;
      deliveryDateColumn: string | null;
      uniqueDeliveryDates: { date: string; count: number }[];
      sample: Record<string, string>[];
    };
    const summaries: FileSummary[] = [];

    for (const key of files) {
      const fileName = key.replace(PREFIX, "");
      const filenameDate = ymdFromKey(key);
      const buf = await getR2ObjectBuffer(key);
      if (!buf) {
        summaries.push({
          fileName,
          filenameDate,
          rowCount: 0,
          deliveryDateColumn: null,
          uniqueDeliveryDates: [],
          sample: [],
        });
        continue;
      }
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        summaries.push({
          fileName,
          filenameDate,
          rowCount: 0,
          deliveryDateColumn: null,
          uniqueDeliveryDates: [],
          sample: [],
        });
        continue;
      }
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
      const rowCount = Math.max(0, aoa.length - 1);
      if (aoa.length < 2) {
        summaries.push({
          fileName,
          filenameDate,
          rowCount,
          deliveryDateColumn: null,
          uniqueDeliveryDates: [],
          sample: [],
        });
        continue;
      }
      const headers = (aoa[0] ?? []).map((c) => String(c ?? ""));
      const normHeaders = headers.map(normalizeHeader);
      const candidates = ["납품예정일", "납품일자", "출고예정일", "기준일자"];
      let dateColIdx = -1;
      let dateColLabel: string | null = null;
      for (const cand of candidates) {
        const idx = normHeaders.indexOf(normalizeHeader(cand));
        if (idx >= 0) {
          dateColIdx = idx;
          dateColLabel = headers[idx] || cand;
          break;
        }
      }

      const dateCounts = new Map<string, number>();
      if (dateColIdx >= 0) {
        for (let i = 1; i < aoa.length; i++) {
          const v = aoa[i][dateColIdx];
          if (v == null || v === "") continue;
          const d = normalizeDateValue(v);
          dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
        }
      }

      // 첫 3행 샘플 (디버그용)
      const sample: Record<string, string>[] = [];
      const sampleHeaders = headers.slice(0, 8);
      for (let i = 1; i < Math.min(4, aoa.length); i++) {
        const obj: Record<string, string> = {};
        sampleHeaders.forEach((h, j) => {
          obj[h || `col${j}`] = String(aoa[i][j] ?? "").slice(0, 30);
        });
        sample.push(obj);
      }

      summaries.push({
        fileName,
        filenameDate,
        rowCount,
        deliveryDateColumn: dateColLabel,
        uniqueDeliveryDates: [...dateCounts.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        sample,
      });
    }

    return json(true, undefined, { summaries });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
