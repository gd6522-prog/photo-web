import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getR2ObjectBuffer, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";

export const runtime = "nodejs";

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

    return json(true, undefined, { cells });
  } catch {
    return json(false, "파일 파싱 오류", null, 500);
  }
}
