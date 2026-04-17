/**
 * 별도작업 페이지 초기 데이터를 1회 요청으로 반환.
 * 인증 1회 + R2 읽기 3개 병렬 처리 → 3번 API 호출 대비 대폭 빠름.
 */
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getR2ObjectText, getR2ObjectBuffer, putR2Object, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";
import { R2_CELLS_CACHE_KEY } from "../product-strategy-cells/route";

export const runtime = "nodejs";

// ─── 집계 ──────────────────────────────────────────────────────
const AGGREGATE_KEY = "separate/_aggregate.json";
const R2_PREFIX = "separate";

type SeparateEntry = {
  store_code: string; store_name: string;
  product_code: string; product_name: string;
  qty: number; center_unit: number; done?: boolean;
};
type AggregateData = Record<string, SeparateEntry & { date: string }>;

async function readAggregate(): Promise<AggregateData | null> {
  const text = await getR2ObjectText(AGGREGATE_KEY);
  if (!text) return null;
  try { return JSON.parse(text) as AggregateData; } catch { return null; }
}

async function buildAndSaveAggregate(): Promise<AggregateData> {
  const keys = await listR2Keys(R2_PREFIX + "/");
  const matched = keys
    .map((k) => { const m = k.match(/^separate\/(\d{4}-\d{2}-\d{2})\/all\.json$/); return m ? { key: k, date: m[1] } : null; })
    .filter(Boolean) as { key: string; date: string }[];

  const aggregate: AggregateData = {};
  await Promise.all(matched.map(async ({ key, date }) => {
    const text = await getR2ObjectText(key);
    if (!text) return;
    try {
      const data = JSON.parse(text) as Record<string, SeparateEntry>;
      for (const entry of Object.values(data)) {
        if ((entry.qty ?? 0) <= 0) continue;
        aggregate[`${date}|${entry.store_code}|${entry.product_code}`] = { date, ...entry };
      }
    } catch { /* skip */ }
  }));
  await putR2Object(AGGREGATE_KEY, JSON.stringify(aggregate), "application/json");
  return aggregate;
}

// ─── 피킹셀 캐시 ───────────────────────────────────────────────
function normalizeHeader(v: unknown) {
  return String(v ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

async function readCells(): Promise<Record<string, string>> {
  const text = await getR2ObjectText(R2_CELLS_CACHE_KEY);
  if (text) { try { return JSON.parse(text) as Record<string, string>; } catch { /* 재파싱 */ } }
  // 캐시 없으면 Excel 파싱 (업로드 직후 워밍 안 됐을 때 폴백)
  const keys = await listR2Keys("file-uploads/product-strategy/");
  if (!keys.length) return {};
  const buf = await getR2ObjectBuffer(keys[0]);
  if (!buf) return {};
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return {};
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
    if (rows.length < 2) return {};
    const hdrs = rows[0].map(normalizeHeader);
    const ci = hdrs.indexOf("상품코드"), pi = hdrs.indexOf("피킹셀");
    if (ci < 0 || pi < 0) return {};
    const cells: Record<string, string> = {};
    for (let i = 1; i < rows.length; i++) {
      const code = String(rows[i][ci] ?? "").trim();
      if (code) cells[code] = String(rows[i][pi] ?? "").trim();
    }
    void putR2Object(R2_CELLS_CACHE_KEY, JSON.stringify(cells), "application/json");
    return cells;
  } catch { return {}; }
}

// ─── 작업센터 입수 캐시 ────────────────────────────────────────
const UNITS_CACHE_KEY = "file-uploads/workcenter-product-units-cache.json";

async function readUnits(): Promise<Record<string, { box_unit: number; picking_unit: number }>> {
  const text = await getR2ObjectText(UNITS_CACHE_KEY);
  if (text) { try { return JSON.parse(text) as Record<string, { box_unit: number; picking_unit: number }>; } catch { /* 재파싱 */ } }
  const keys = await listR2Keys("file-uploads/workcenter-product-master/");
  if (!keys.length) return {};
  const buf = await getR2ObjectBuffer(keys[0]);
  if (!buf) return {};
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return {};
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
    if (rows.length < 2) return {};
    const hdrs = rows[0].map(normalizeHeader);
    const findIdx = (labels: string[]) => { for (const l of labels) { const i = hdrs.indexOf(normalizeHeader(l)); if (i >= 0) return i; } return -1; };
    const ci = findIdx(["상품코드"]);
    const bi = findIdx(["센터발주입수", "외박스입수", "발주입수"]);
    const ki = findIdx(["센터피킹입수", "피킹입수"]);
    if (ci < 0) return {};
    const units: Record<string, { box_unit: number; picking_unit: number }> = {};
    for (let i = 1; i < rows.length; i++) {
      const code = String(rows[i][ci] ?? "").trim();
      if (!code) continue;
      units[code] = { box_unit: bi >= 0 ? parseFloat(String(rows[i][bi] ?? "0")) || 0 : 0, picking_unit: ki >= 0 ? parseFloat(String(rows[i][ki] ?? "0")) || 0 : 0 };
    }
    void putR2Object(UNITS_CACHE_KEY, JSON.stringify(units), "application/json");
    return units;
  } catch { return {}; }
}

// ─── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  // 집계 + 셀 + 입수 병렬 읽기
  let [aggregate, cells, units] = await Promise.all([readAggregate(), readCells(), readUnits()]);

  // 집계 없음 → 재생성
  if (!aggregate) {
    aggregate = await buildAndSaveAggregate();
  }

  const entries = Object.values(aggregate).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.store_code !== b.store_code) return a.store_code.localeCompare(b.store_code);
    return a.product_name.localeCompare(b.product_name, "ko");
  });

  return json(true, undefined, { entries, cells, units });
}
