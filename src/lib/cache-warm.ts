/**
 * 파일 업로드 후 R2 JSON 캐시를 즉시 워밍하는 유틸리티.
 * file-upload confirm 시점에 void로 백그라운드 실행.
 *
 * 새 슬롯을 추가할 때:
 *   1. 이 파일에 warm함수 하나 추가 (Excel 파싱 → putR2Object)
 *   2. WARM_MAP에 "슬롯키": warm함수 등록
 *   3. file-upload/route.ts upload-url 블록에 캐시 무효화 추가
 */

import * as XLSX from "xlsx";
import { getR2ObjectBuffer, putR2Object, listR2Keys, deleteR2Objects } from "@/lib/r2";

// ─── 슬롯별 캐시 키 ────────────────────────────────────────────
export const CACHE_KEYS = {
  "product-strategy":        "file-uploads/product-strategy-cells-cache.json",
  "workcenter-product-master": "file-uploads/workcenter-product-units-cache.json",
} as const;

/** 상품코드 → 작업구분 캐시 (product-strategy 파일에서 추출) */
export const WORKTYPE_CACHE_KEY = "file-uploads/product-strategy-worktype-cache.json";

type WarmableSlot = keyof typeof CACHE_KEYS;

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

// ─── product-strategy → 상품코드: 피킹셀 ──────────────────────
async function warmProductStrategy() {
  const keys = await listR2Keys("file-uploads/product-strategy/");
  if (!keys.length) return;
  const buffer = await getR2ObjectBuffer(keys[0]);
  if (!buffer) return;

  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return;

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return;

  const headers = rows[0].map(normalizeHeader);
  const codeIdx = headers.indexOf("상품코드");
  const cellIdx = headers.indexOf("피킹셀");
  if (codeIdx === -1 || cellIdx === -1) return;

  const cells: Record<string, string> = {};
  const worktypes: Record<string, string> = {};
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    const cell = String(rows[i][cellIdx] ?? "").trim();
    const worktype = String(rows[i][19] ?? "").trim(); // 작업구분 (index 19)
    if (code) {
      cells[code] = cell;
      if (worktype) worktypes[code] = worktype;
    }
  }
  await Promise.all([
    putR2Object(CACHE_KEYS["product-strategy"], JSON.stringify(cells), "application/json"),
    putR2Object(WORKTYPE_CACHE_KEY, JSON.stringify(worktypes), "application/json"),
  ]);
}

// ─── workcenter-product-master → 상품코드: {box_unit, picking_unit} ──
async function warmWorkcenterProductMaster() {
  const keys = await listR2Keys("file-uploads/workcenter-product-master/");
  if (!keys.length) return;
  const buffer = await getR2ObjectBuffer(keys[0]);
  if (!buffer) return;

  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return;

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return;

  const headers = rows[0].map(normalizeHeader);
  const findIdx = (labels: string[]) => {
    for (const l of labels) { const i = headers.indexOf(normalizeHeader(l)); if (i >= 0) return i; }
    return -1;
  };
  const codeIdx    = findIdx(["상품코드"]);
  const boxIdx     = findIdx(["센터발주입수", "외박스입수", "발주입수"]);
  const pickingIdx = findIdx(["센터피킹입수", "피킹입수"]);
  if (codeIdx === -1) return;

  const units: Record<string, { box_unit: number; picking_unit: number }> = {};
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    units[code] = {
      box_unit:     boxIdx     >= 0 ? parseFloat(String(rows[i][boxIdx]     ?? "0")) || 0 : 0,
      picking_unit: pickingIdx >= 0 ? parseFloat(String(rows[i][pickingIdx] ?? "0")) || 0 : 0,
    };
  }
  await putR2Object(CACHE_KEYS["workcenter-product-master"], JSON.stringify(units), "application/json");
}

// ─── 슬롯 → warm 함수 맵 ──────────────────────────────────────
const WARM_MAP: Record<WarmableSlot, () => Promise<void>> = {
  "product-strategy":          warmProductStrategy,
  "workcenter-product-master": warmWorkcenterProductMaster,
};

/** 업로드 confirm 직후 void로 호출. 슬롯이 맵에 없으면 아무것도 안 함. */
export function triggerCacheWarm(slotKey: string): void {
  const fn = WARM_MAP[slotKey as WarmableSlot];
  if (fn) void fn().catch(() => { /* 워밍 실패는 무시 — 다음 요청에서 폴백 */ });
}

/** 업로드 upload-url 직후 해당 슬롯 캐시 무효화. */
export async function invalidateCache(slotKey: string): Promise<void> {
  const cacheKey = CACHE_KEYS[slotKey as WarmableSlot];
  if (cacheKey) await deleteR2Objects([cacheKey]).catch(() => {});
}
