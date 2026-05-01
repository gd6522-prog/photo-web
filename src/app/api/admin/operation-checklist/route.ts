import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getR2ObjectBuffer, listR2Keys } from "@/lib/r2";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function normalizeWorkType(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function findHeaderIndex(headers: string[], labels: string[]): number {
  for (const label of labels) {
    const index = headers.indexOf(normalizeHeader(label));
    if (index >= 0) return index;
  }
  return -1;
}

// ── 인메모리 캐시: 파일의 R2 key(타임스탬프 포함)가 같으면 재파싱 안 함 ─────
type StrategyRow = {
  picking_cell: string;
  work_type: string;
  full_box_yn: string;
};

let inventoryCache: { key: string; data: Set<string> } | null = null;
let strategyCache: { key: string; data: Map<string, StrategyRow> } | null = null;

async function getLatestKey(prefix: string): Promise<string | null> {
  const keys = await listR2Keys(prefix);
  return keys.length === 0 ? null : keys[0];
}

async function fetchAndParseInventory(key: string): Promise<Set<string>> {
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return new Set();
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return new Set();

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return new Set();

  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  // 재고 판단 기준: 가용재고만 사용
  const qtyIdx = findHeaderIndex(headers, ["가용재고"]);
  if (codeIdx < 0 || qtyIdx < 0) return new Set();

  const result = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    const qtyRaw = String(rows[i][qtyIdx] ?? "").replace(/,/g, "");
    const qty = parseFloat(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    result.add(code);
  }
  return result;
}

async function fetchAndParseStrategy(key: string): Promise<Map<string, StrategyRow>> {
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return new Map();
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return new Map();

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return new Map();

  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const cellIdx = findHeaderIndex(headers, ["피킹셀"]);
  const workTypeIdx = findHeaderIndex(headers, ["작업구분"]);
  const fullBoxIdx = findHeaderIndex(headers, ["완박스작업여부"]);
  if (codeIdx < 0) return new Map();

  const map = new Map<string, StrategyRow>();
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    map.set(code, {
      picking_cell: cellIdx >= 0 ? String(rows[i][cellIdx] ?? "").trim() : "",
      work_type: workTypeIdx >= 0 ? String(rows[i][workTypeIdx] ?? "").trim() : "",
      full_box_yn: fullBoxIdx >= 0 ? String(rows[i][fullBoxIdx] ?? "").trim() : "",
    });
  }
  return map;
}

async function getInventory(): Promise<Set<string>> {
  const key = await getLatestKey("file-uploads/inventory-status/");
  if (!key) return new Set();
  if (inventoryCache && inventoryCache.key === key) return inventoryCache.data;
  const data = await fetchAndParseInventory(key);
  inventoryCache = { key, data };
  return data;
}

async function getStrategy(): Promise<Map<string, StrategyRow>> {
  const key = await getLatestKey("file-uploads/product-strategy/");
  if (!key) return new Map();
  if (strategyCache && strategyCache.key === key) return strategyCache.data;
  const data = await fetchAndParseStrategy(key);
  strategyCache = { key, data };
  return data;
}

// ── 피킹셀 prefix(앞 2자리) → 작업구분명 매핑표 ──────────────────────────
const CELL_PREFIX_TO_WORK_TYPE: Record<string, string> = {
  "01": "박스수기", "02": "박스수기", "03": "박스수기",
  "04": "박스존1", "05": "박스존1",
  "07": "이너존A",
  "21": "슬라존A", "22": "슬라존A", "23": "슬라존A", "24": "슬라존A", "25": "슬라존A",
  "40": "경량존A", "41": "경량존A", "42": "경량존A", "43": "경량존A", "44": "경량존A",
  "45": "경량존A", "46": "경량존A", "47": "경량존A", "48": "경량존A", "49": "경량존A",
  "50": "경량존A", "51": "경량존A", "52": "경량존A",
  "61": "이형존A",
  "71": "담배존",
  "72": "담배수기",
  "81": "유가증권",
  "91": "행사존A",
};

// 완박스작업여부가 반드시 "예"여야 하는 피킹셀 prefix
const FULL_BOX_REQUIRED_PREFIXES = new Set([
  "07", // 이너존A
  "21", "22", "23", "24", "25", // 슬라존A
]);

function getCellPrefix(cell: string): string {
  const digits = cell.replace(/\D/g, "");
  if (digits.length < 2) return "";
  return digits.slice(0, 2);
}

function isFullBoxYes(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "예" || v === "y" || v === "yes" || v === "true" || v === "1" || v === "o";
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const [stockSet, strategy] = await Promise.all([getInventory(), getStrategy()]);

    let locationMissing = 0;
    let workTypeMissing = 0;
    let workTypeMisconfigured = 0;
    let fullBoxMissing = 0;

    for (const code of stockSet) {
      const row = strategy.get(code);
      if (!row) {
        // 전략관리에 등록 자체가 없으면 로케이션 + 작업구분 모두 미지정으로 카운트
        locationMissing += 1;
        workTypeMissing += 1;
        continue;
      }

      if (!row.picking_cell) locationMissing += 1;

      if (!row.work_type) {
        workTypeMissing += 1;
      } else if (row.picking_cell) {
        const prefix = getCellPrefix(row.picking_cell);
        const expected = CELL_PREFIX_TO_WORK_TYPE[prefix];
        if (expected && normalizeWorkType(expected) !== normalizeWorkType(row.work_type)) {
          workTypeMisconfigured += 1;
        }
      }

      if (row.picking_cell) {
        const prefix = getCellPrefix(row.picking_cell);
        if (FULL_BOX_REQUIRED_PREFIXES.has(prefix) && !isFullBoxYes(row.full_box_yn)) {
          fullBoxMissing += 1;
        }
      }
    }

    return json(true, undefined, {
      counts: {
        location_missing: locationMissing,
        work_type_missing: workTypeMissing,
        work_type_misconfigured: workTypeMisconfigured,
        full_box_missing: fullBoxMissing,
        shipment_below_standard: 0, // TODO: 출고기준미달 — 세부 기준 결정 후 구현 예정
      },
      sources: {
        inventory_stock_count: stockSet.size,
        strategy_count: strategy.size,
      },
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
