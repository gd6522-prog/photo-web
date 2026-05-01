import * as XLSX from "xlsx";
import { getR2ObjectBuffer, getR2ObjectText, listR2Keys, putR2Object } from "@/lib/r2";

// ── 모듈 인메모리 캐시 ─────────────────────────────────────────────────
type StrategyRow = {
  picking_cell: string;
  work_type: string;
  full_box_yn: string;
};

let inventoryMemCache: { key: string; parsed: InventoryParsed } | null = null;
let strategyMemCache: { key: string; parsed: StrategyParsed } | null = null;

// ── R2 결과 캐시 (모든 인스턴스 공유) ────────────────────────────────────
// 캐시 키에 버전 suffix 를 두어 계산 로직이 바뀌면 자동으로 옛 캐시가 무효화되도록.
const R2_COUNTS_CACHE_KEY = "file-uploads/_operation-checklist-cache-v4.json";

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
  diagnostic?: ChecklistDiagnostic;
  computed_at: string;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC") // 한글 자모 분리 형태(ㅍㅣㅋㅣㅇㅅㅔㄹ) → 완성형 통일
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
  if (keys.length === 0) return null;
  // R2 list 는 lexicographic ASC 반환. 파일명에 _YYYYMMDD_ 패턴이 있으면
  // 사전순 가장 큰 값이 최신이므로 desc 정렬 후 첫 번째 사용.
  const sorted = [...keys].sort().reverse();
  return sorted[0];
}

type InventoryParsed = {
  data: Set<string>;
  rawHeaders: string[];
};

async function fetchAndParseInventory(key: string): Promise<InventoryParsed> {
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return { data: new Set(), rawHeaders: [] };
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { data: new Set(), rawHeaders: [] };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return { data: new Set(), rawHeaders: [] };

  const rawHeaders = (rows[0] ?? []).map((c) => String(c ?? ""));
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const qtyIdx = findHeaderIndex(headers, ["가용재고"]);
  if (codeIdx < 0 || qtyIdx < 0) return { data: new Set(), rawHeaders };

  const result = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    const qtyRaw = String(rows[i][qtyIdx] ?? "").replace(/,/g, "");
    const qty = parseFloat(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    result.add(code);
  }
  return { data: result, rawHeaders };
}

type StrategyParsed = {
  data: Map<string, StrategyRow>;
  rawHeaders: string[];
  matched: { code: number; cell: number; workType: number; fullBox: number };
};

async function fetchAndParseStrategy(key: string): Promise<StrategyParsed> {
  const empty: StrategyParsed = {
    data: new Map(),
    rawHeaders: [],
    matched: { code: -1, cell: -1, workType: -1, fullBox: -1 },
  };
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return empty;
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return empty;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return empty;

  const rawHeaders = (rows[0] ?? []).map((c) => String(c ?? ""));
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const cellIdx = findHeaderIndex(headers, ["피킹셀"]);
  const workTypeIdx = findHeaderIndex(headers, ["작업구분"]);
  const fullBoxIdx = findHeaderIndex(headers, ["완박스작업여부"]);
  const matched = { code: codeIdx, cell: cellIdx, workType: workTypeIdx, fullBox: fullBoxIdx };
  if (codeIdx < 0) return { ...empty, rawHeaders, matched };

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
  return { data: map, rawHeaders, matched };
}

async function getInventory(key: string): Promise<InventoryParsed> {
  if (inventoryMemCache && inventoryMemCache.key === key) return inventoryMemCache.parsed;
  const parsed = await fetchAndParseInventory(key);
  inventoryMemCache = { key, parsed };
  return parsed;
}

async function getStrategy(key: string): Promise<StrategyParsed> {
  if (strategyMemCache && strategyMemCache.key === key) return strategyMemCache.parsed;
  const parsed = await fetchAndParseStrategy(key);
  strategyMemCache = { key, parsed };
  return parsed;
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
  // 피킹셀은 00-00-000(7자리) 형식. Excel 이 숫자로 저장하며 선두 0 을 잘라낸 경우(예: "07" → 7)
  // 7자리로 좌측 0 패딩한 뒤 앞 2자리를 prefix 로 사용한다.
  const digits = cell.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(7, "0").slice(0, 2);
}

function isFullBoxYes(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "예" || v === "y" || v === "yes" || v === "true" || v === "1" || v === "o";
}

export type ChecklistDiagnostic = {
  // 재고 SKU 중 전략관리에 등록 안 된 수
  stock_no_strategy: number;
  // 재고 + 전략관리 매칭 SKU 의 picking_cell prefix 분포
  prefix_distribution: Record<string, number>;
  // 07/21~25 매칭 SKU 의 완박스작업여부 raw 값 분포
  full_box_value_distribution: Record<string, number>;
  // 실제 파일에서 읽은 헤더(원문) — 컬럼명 디버깅용
  inventory_headers?: string[];
  strategy_headers?: string[];
  // 상품별 전략관리 파일 컬럼 매칭 결과 (-1 이면 못찾음)
  strategy_matched?: { code: number; cell: number; workType: number; fullBox: number };
  // 사용된 R2 키 (마지막 50자만)
  inventory_key_tail?: string;
  strategy_key_tail?: string;
};

function tally(stockSet: Set<string>, strategy: Map<string, StrategyRow>): {
  counts: ChecklistCounts;
  sources: ChecklistSources;
  diagnostic: ChecklistDiagnostic;
} {
  let locationMissing = 0;
  let workTypeMissing = 0;
  let workTypeMisconfigured = 0;
  let fullBoxMissing = 0;

  let stockNoStrategy = 0;
  const prefixDistribution: Record<string, number> = {};
  const fullBoxValueDistribution: Record<string, number> = {};

  for (const code of stockSet) {
    const row = strategy.get(code);
    if (!row) {
      stockNoStrategy += 1;
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
      prefixDistribution[prefix] = (prefixDistribution[prefix] ?? 0) + 1;
      if (FULL_BOX_REQUIRED_PREFIXES.has(prefix)) {
        const rawKey = row.full_box_yn || "(빈칸)";
        fullBoxValueDistribution[rawKey] = (fullBoxValueDistribution[rawKey] ?? 0) + 1;
        if (!isFullBoxYes(row.full_box_yn)) {
          fullBoxMissing += 1;
        }
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
    diagnostic: {
      stock_no_strategy: stockNoStrategy,
      prefix_distribution: prefixDistribution,
      full_box_value_distribution: fullBoxValueDistribution,
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
  diagnostic?: ChecklistDiagnostic;
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
      return { counts: cached.counts, sources: cached.sources, diagnostic: cached.diagnostic, cache_hit: true };
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

  const [inventoryParsed, strategyParsed] = await Promise.all([
    getInventory(inventoryKey),
    getStrategy(strategyKey),
  ]);

  const { counts, sources, diagnostic: tallyDiag } = tally(inventoryParsed.data, strategyParsed.data);

  const diagnostic: ChecklistDiagnostic = {
    ...tallyDiag,
    inventory_headers: inventoryParsed.rawHeaders,
    strategy_headers: strategyParsed.rawHeaders,
    strategy_matched: strategyParsed.matched,
    inventory_key_tail: inventoryKey.slice(-50),
    strategy_key_tail: strategyKey.slice(-50),
  };

  // R2 캐시에 저장
  await writeCountsCache({
    inventory_key: inventoryKey,
    strategy_key: strategyKey,
    counts,
    sources,
    diagnostic,
    computed_at: new Date().toISOString(),
  });

  return { counts, sources, diagnostic, cache_hit: false };
}
