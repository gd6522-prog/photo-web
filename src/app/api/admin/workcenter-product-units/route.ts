import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getR2ObjectBuffer, getR2ObjectText, putR2Object, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";

export const runtime = "nodejs";

const R2_CACHE_KEY = "file-uploads/workcenter-product-units-cache.json";

// 인메모리 캐시 (프로세스 내 중복 요청 방지)
const memCache: { units: Record<string, { box_unit: number; picking_unit: number }>; expiresAt: number } = {
  units: {},
  expiresAt: 0,
};
const MEM_CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function findColIdx(headers: string[], labels: string[]): number {
  for (const label of labels) {
    const idx = headers.indexOf(normalizeHeader(label));
    if (idx >= 0) return idx;
  }
  return -1;
}

// 작업센터별 취급상품 마스터에서 상품코드 → { box_unit(센터발주입수), picking_unit(센터피킹입수) } 매핑 반환
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  // 1. 인메모리 캐시
  if (Date.now() < memCache.expiresAt) {
    return json(true, undefined, { units: memCache.units });
  }

  // 2. R2 JSON 캐시
  const cachedText = await getR2ObjectText(R2_CACHE_KEY);
  if (cachedText) {
    try {
      const units = JSON.parse(cachedText) as Record<string, { box_unit: number; picking_unit: number }>;
      memCache.units = units;
      memCache.expiresAt = Date.now() + MEM_CACHE_TTL_MS;
      return json(true, undefined, { units });
    } catch { /* 손상 시 재파싱 */ }
  }

  // 3. Excel 파싱
  const keys = await listR2Keys("file-uploads/workcenter-product-master/");
  if (keys.length === 0) {
    return json(true, undefined, { units: {} });
  }

  const buffer = await getR2ObjectBuffer(keys[0]);
  if (!buffer) {
    return json(true, undefined, { units: {} });
  }

  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return json(true, undefined, { units: {} });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
    if (rows.length < 2) return json(true, undefined, { units: {} });

    const headers = rows[0].map(normalizeHeader);
    const productCodeIdx = findColIdx(headers, ["상품코드"]);
    const boxUnitIdx = findColIdx(headers, ["센터발주입수", "외박스입수", "발주입수"]);
    const pickingUnitIdx = findColIdx(headers, ["센터피킹입수", "피킹입수"]);

    if (productCodeIdx === -1) {
      return json(false, "상품코드 컬럼을 찾을 수 없습니다.", null, 400);
    }

    const units: Record<string, { box_unit: number; picking_unit: number }> = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row[productCodeIdx] ?? "").trim();
      if (!code) continue;
      const box_unit = boxUnitIdx >= 0 ? parseFloat(String(row[boxUnitIdx] ?? "0")) || 0 : 0;
      const picking_unit = pickingUnitIdx >= 0 ? parseFloat(String(row[pickingUnitIdx] ?? "0")) || 0 : 0;
      units[code] = { box_unit, picking_unit };
    }

    // R2 + 인메모리 캐시 저장 (백그라운드)
    void putR2Object(R2_CACHE_KEY, JSON.stringify(units), "application/json");
    memCache.units = units;
    memCache.expiresAt = Date.now() + MEM_CACHE_TTL_MS;

    return json(true, undefined, { units });
  } catch {
    return json(false, "파일 파싱 오류", null, 500);
  }
}
