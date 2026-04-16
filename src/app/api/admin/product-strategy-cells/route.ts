import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getR2ObjectBuffer, getR2ObjectText, putR2Object, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";

export const runtime = "nodejs";

export const R2_CELLS_CACHE_KEY = "file-uploads/product-strategy-cells-cache.json";

// 인메모리 캐시 (프로세스 내 중복 요청 방지)
const memCache: { cells: Record<string, string>; expiresAt: number } = { cells: {}, expiresAt: 0 };
const MEM_CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

// 상품별 전략관리 파일에서 상품코드 → 피킹셀 매핑 반환
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  // 1. 인메모리 캐시
  if (Date.now() < memCache.expiresAt) {
    return json(true, undefined, { cells: memCache.cells });
  }

  // 2. R2 JSON 캐시 (Excel 파싱 없이 즉시 반환)
  const cachedText = await getR2ObjectText(R2_CELLS_CACHE_KEY);
  if (cachedText) {
    try {
      const cells = JSON.parse(cachedText) as Record<string, string>;
      memCache.cells = cells;
      memCache.expiresAt = Date.now() + MEM_CACHE_TTL_MS;
      return json(true, undefined, { cells });
    } catch { /* 손상 시 재파싱 */ }
  }

  // 3. Excel 파싱 (R2 캐시 없을 때만)
  const keys = await listR2Keys("file-uploads/product-strategy/");
  if (keys.length === 0) {
    return json(true, undefined, { cells: {} });
  }

  const buffer = await getR2ObjectBuffer(keys[0]);
  if (!buffer) {
    return json(true, undefined, { cells: {} });
  }

  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return json(true, undefined, { cells: {} });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
    if (rows.length < 2) return json(true, undefined, { cells: {} });

    const headers = rows[0].map(normalizeHeader);
    const productCodeIdx = headers.indexOf("상품코드");
    const pickingCellIdx = headers.indexOf("피킹셀");

    if (productCodeIdx === -1 || pickingCellIdx === -1) {
      return json(false, "상품코드 또는 피킹셀 컬럼을 찾을 수 없습니다.", null, 400);
    }

    const cells: Record<string, string> = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row[productCodeIdx] ?? "").trim();
      const cell = String(row[pickingCellIdx] ?? "").trim();
      if (code) cells[code] = cell;
    }

    // R2 + 인메모리 캐시 저장 (백그라운드)
    void putR2Object(R2_CELLS_CACHE_KEY, JSON.stringify(cells), "application/json");
    memCache.cells = cells;
    memCache.expiresAt = Date.now() + MEM_CACHE_TTL_MS;

    return json(true, undefined, { cells });
  } catch {
    return json(false, "파일 파싱 오류", null, 500);
  }
}
