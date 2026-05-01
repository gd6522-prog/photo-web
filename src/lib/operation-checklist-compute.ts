import * as XLSX from "xlsx";
import { getR2ObjectBuffer, getR2ObjectText, listR2Keys, putR2Object } from "@/lib/r2";

// ── 모듈 인메모리 캐시 ─────────────────────────────────────────────────
type StrategyRow = {
  picking_cell: string;
  work_type: string;
  full_box_yn: string;
};

let inventoryMemCache: { key: string; data: Set<string> } | null = null;
let strategyMemCache: { key: string; data: Map<string, StrategyRow> } | null = null;

// ── R2 결과 캐시 (모든 인스턴스 공유) ────────────────────────────────────
const R2_COUNTS_CACHE_KEY = "file-uploads/_operation-checklist-cache.json";

export type ChecklistCounts = {
  location_missing: number;
  work_type_missing: number;
  work_type_misconfigured: number;
  full_box_missing: number;
  shipment_below_standard: number;
};

export type ChecklistSources = {
  inventory_stock_count: number;
  strategy_count: number;
};

type ChecklistCacheEntry = {
  inventory_key: string;
  strategy_key: string;
  counts: ChecklistCounts;
  sources: ChecklistSources;
  computed_at: string;
};

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

async function getInventory(key: string): Promise<Set<string>> {
  if (inventoryMemCache && inventoryMemCache.key === key) return inventoryMemCache.data;
  const data = await fetchAndParseInventory(key);
  inventoryMemCache = { key, data };
  return data;
}

async function getStrategy(key: string): Promise<Map<string, StrategyRow>> {
  if (strategyMemCache && strategyMemCache.key === key) return strategyMemCache.data;
  const data = await fetchAndParseStrategy(key);
  strategyMemCache = { key, data };
  return data;
}

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

const FULL_BOX_REQUIRED_PREFIXES = new Set(["07", "21", "22", "23", "24", "25"]);

function getCellPrefix(cell: string): string {
  const digits = cell.replace(/\D/g, "");
  if (digits.length < 2) return "";
  return digits.slice(0, 2);
}

function isFullBoxYes(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "예" || v === "y" || v === "yes" || v === "true" || v === "1" || v === "o";
}

function tally(stockSet: Set<string>, strategy: Map<string, StrategyRow>): {
  counts: ChecklistCounts;
  sources: ChecklistSources;
} {
  let locationMissing = 0;
  let workTypeMissing = 0;
  let workTypeMisconfigured = 0;
  let fullBoxMissing = 0;

  for (const code of stockSet) {
    const row = strategy.get(code);
    if (!row) {
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

  return {
    counts: {
      location_missing: locationMissing,
      work_type_missing: workTypeMissing,
      work_type_misconfigured: workTypeMisconfigured,
      full_box_missing: fullBoxMissing,
      shipment_below_standard: 0, // TODO
    },
    sources: {
      inventory_stock_count: stockSet.size,
      strategy_count: strategy.size,
    },
  };
}

async function readCountsCache(): Promise<ChecklistCacheEntry | null> {
  try {
    const text = await getR2ObjectText(R2_COUNTS_CACHE_KEY);
    if (!text) return null;
    return JSON.parse(text) as ChecklistCacheEntry;
  } catch {
    return null;
  }
}

async function writeCountsCache(entry: ChecklistCacheEntry): Promise<void> {
  try {
    await putR2Object(R2_COUNTS_CACHE_KEY, JSON.stringify(entry), "application/json");
  } catch {
    // 캐시 쓰기 실패는 치명적이지 않음
  }
}

/**
 * 통합체크리스트 카운트 계산.
 * R2 결과 캐시(파일 R2 key 기준) 우선, miss 시 파싱·계산 후 저장.
 * @param opts.force true 시 캐시 무시하고 강제 재계산 (cron 워밍 등)
 */
export async function computeChecklistCounts(opts?: { force?: boolean }): Promise<{
  counts: ChecklistCounts;
  sources: ChecklistSources;
  cache_hit: boolean;
}> {
  const [inventoryKey, strategyKey] = await Promise.all([
    getLatestKey("file-uploads/inventory-status/"),
    getLatestKey("file-uploads/product-strategy/"),
  ]);

  // R2 캐시 조회 (force 모드면 스킵)
  if (!opts?.force && inventoryKey && strategyKey) {
    const cached = await readCountsCache();
    if (cached && cached.inventory_key === inventoryKey && cached.strategy_key === strategyKey) {
      return { counts: cached.counts, sources: cached.sources, cache_hit: true };
    }
  }

  // 파일이 하나라도 없으면 빈 결과
  if (!inventoryKey || !strategyKey) {
    const empty: ChecklistCounts = {
      location_missing: 0,
      work_type_missing: 0,
      work_type_misconfigured: 0,
      full_box_missing: 0,
      shipment_below_standard: 0,
    };
    return { counts: empty, sources: { inventory_stock_count: 0, strategy_count: 0 }, cache_hit: false };
  }

  const [stockSet, strategy] = await Promise.all([
    getInventory(inventoryKey),
    getStrategy(strategyKey),
  ]);

  const { counts, sources } = tally(stockSet, strategy);

  // R2 캐시에 저장
  await writeCountsCache({
    inventory_key: inventoryKey,
    strategy_key: strategyKey,
    counts,
    sources,
    computed_at: new Date().toISOString(),
  });

  return { counts, sources, cache_hit: false };
}
