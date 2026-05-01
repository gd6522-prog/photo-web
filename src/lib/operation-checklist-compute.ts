import * as XLSX from "xlsx";
import { getR2ObjectBuffer, getR2ObjectText, listR2Keys, putR2Object } from "@/lib/r2";

// ── 캐시 키 (계산 로직 변경 시 버전 bump) ─────────────────────────────
const R2_COUNTS_CACHE_KEY = "file-uploads/_operation-checklist-cache-v13.json";

// ── 타입 ─────────────────────────────────────────────────────────────
type StrategyRow = {
  product_name: string;
  picking_cell: string;
  work_type: string;
  full_box_yn: string;
};

type InventorySku = {
  product_code: string;
  product_name: string;
  qty: number; // 가용수량 합계 (모든 로트)
  expiry_date: string; // 가장 빠른 소비기한 (YYYY-MM-DD)
};

// (상품코드 + 소비기한) 단위로 합쳐진 로트 — 로트는 다르지만 같은 소비기한이면 합산
type InventoryLot = {
  product_code: string;
  product_name: string;
  expiry_date: string;
  qty: number;
};

type WorkcenterRow = {
  shipment_standard_days: number; // 출고기준일수
};

type WorkcenterParsed = {
  data: Map<string, WorkcenterRow>;
  // 활성 센터(미사용_화성2(상온) 도 아니고 빈칸도 아닌)에 한 행이라도 등록된 SKU.
  // 피킹셀/작업구분 미지정 체크는 이 집합에 포함된 SKU 만 대상으로 함.
  activeSkus: Set<string>;
  // 작업센터마스터 파일이 업로드되어 있는지 여부 (파일 없으면 필터링 미적용)
  filePresent: boolean;
};

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

export type DetailItem = {
  product_code: string;
  product_name?: string;
  picking_cell?: string;
  work_type?: string;
  expected_work_type?: string;
  full_box_yn?: string;
  expiry_date?: string;
  shipment_standard_days?: number;
  cutoff_date?: string;
  qty?: number;
  days_short?: number; // 출고기준미달용: cutoff_date - expiry_date (일수)
};

export type ChecklistDetails = {
  location_missing: DetailItem[];
  work_type_missing: DetailItem[];
  work_type_misconfigured: DetailItem[];
  full_box_missing: DetailItem[];
  shipment_below_standard: DetailItem[];
};

type ChecklistCacheEntry = {
  inventory_key: string;
  strategy_key: string;
  workcenter_key: string;
  counts: ChecklistCounts;
  sources: ChecklistSources;
  details: ChecklistDetails;
  computed_at: string;
};

// ── 모듈 인메모리 캐시 ─────────────────────────────────────────────────
type InventoryParsed = {
  byCode: Map<string, InventorySku>;
  lots: InventoryLot[];
};
let inventoryMemCache: { key: string; data: InventoryParsed } | null = null;
let strategyMemCache: { key: string; data: Map<string, StrategyRow> } | null = null;
let workcenterMemCache: { key: string; data: WorkcenterParsed } | null = null;

// ── 헬퍼 ───────────────────────────────────────────────────────────────
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
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
  return [...keys].sort().reverse()[0];
}

// 다양한 형식의 날짜 문자열을 YYYY-MM-DD 로 정규화 ("" 반환 시 파싱 실패)
function normalizeDate(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  // YYYYMMDD
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  // Excel serial date number (1900-01-01 = 1, 윤년 버그 보정)
  const num = Number(s);
  if (Number.isFinite(num) && num > 25569 && num < 60000) {
    const ms = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${dd}`;
  }
  return "";
}

function todayKstISO(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDaysToISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// iso1 - iso2 (일 단위). 둘 다 YYYY-MM-DD 형식이어야 함.
function diffDaysISO(iso1: string, iso2: string): number {
  const [y1, m1, d1] = iso1.split("-").map(Number);
  const [y2, m2, d2] = iso2.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t2) / 86400000);
}

// ── 파싱: 재고현황 ─────────────────────────────────────────────────────
async function fetchAndParseInventory(key: string): Promise<InventoryParsed> {
  const byCode = new Map<string, InventorySku>();
  const lotMap = new Map<string, InventoryLot>(); // key = `${code}|${expiry}`
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return { byCode, lots: [] };
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { byCode, lots: [] };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return { byCode, lots: [] };

  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const nameIdx = findHeaderIndex(headers, ["상품명"]);
  const qtyIdx = findHeaderIndex(headers, ["가용수량", "가용재고"]);
  const expiryIdx = findHeaderIndex(headers, ["소비기한", "유통기한"]);
  if (codeIdx < 0 || qtyIdx < 0) return { byCode, lots: [] };

  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    const qtyRaw = String(rows[i][qtyIdx] ?? "").replace(/,/g, "");
    const qty = parseFloat(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const name = nameIdx >= 0 ? String(rows[i][nameIdx] ?? "").trim() : "";
    const expiry = expiryIdx >= 0 ? normalizeDate(rows[i][expiryIdx]) : "";

    // 상품코드별 집계 (전체 합산, 가장 빠른 소비기한)
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, { product_code: code, product_name: name, qty, expiry_date: expiry });
    } else {
      existing.qty += qty;
      if (expiry && (!existing.expiry_date || expiry < existing.expiry_date)) {
        existing.expiry_date = expiry;
      }
      if (!existing.product_name && name) existing.product_name = name;
    }

    // (상품코드 + 소비기한) 별 로트 합산 — 로트는 다르지만 같은 소비기한이면 가용수량 합산
    const lotKey = `${code}|${expiry}`;
    const lot = lotMap.get(lotKey);
    if (!lot) {
      lotMap.set(lotKey, { product_code: code, product_name: name, expiry_date: expiry, qty });
    } else {
      lot.qty += qty;
      if (!lot.product_name && name) lot.product_name = name;
    }
  }

  return { byCode, lots: [...lotMap.values()] };
}

// ── 파싱: 상품별 전략관리 ──────────────────────────────────────────────
async function fetchAndParseStrategy(key: string): Promise<Map<string, StrategyRow>> {
  const map = new Map<string, StrategyRow>();
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return map;
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return map;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return map;

  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const nameIdx = findHeaderIndex(headers, ["상품명"]);
  const cellIdx = findHeaderIndex(headers, ["피킹셀"]);
  const workTypeIdx = findHeaderIndex(headers, ["작업구분"]);
  const fullBoxIdx = findHeaderIndex(headers, ["완박스작업여부"]);
  if (codeIdx < 0) return map;

  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    map.set(code, {
      product_name: nameIdx >= 0 ? String(rows[i][nameIdx] ?? "").trim() : "",
      picking_cell: cellIdx >= 0 ? String(rows[i][cellIdx] ?? "").trim() : "",
      work_type: workTypeIdx >= 0 ? String(rows[i][workTypeIdx] ?? "").trim() : "",
      full_box_yn: fullBoxIdx >= 0 ? String(rows[i][fullBoxIdx] ?? "").trim() : "",
    });
  }
  return map;
}

// ── 파싱: 작업센터별 취급상품마스터 ─────────────────────────────────────
const INACTIVE_CENTER_NAME = "미사용_화성2(상온)";

function normalizeCenterName(value: unknown): string {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, "");
}

async function fetchAndParseWorkcenter(key: string): Promise<WorkcenterParsed> {
  const data = new Map<string, WorkcenterRow>();
  const activeSkus = new Set<string>();
  const buffer = await getR2ObjectBuffer(key);
  if (!buffer) return { data, activeSkus, filePresent: false };
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { data, activeSkus, filePresent: true };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return { data, activeSkus, filePresent: true };

  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const stdIdx = findHeaderIndex(headers, ["출고기준일수", "출고기준일"]);
  const centerIdx = findHeaderIndex(headers, ["센터명", "작업센터명", "센터"]);
  if (codeIdx < 0) return { data, activeSkus, filePresent: true };

  const inactiveNormalized = normalizeCenterName(INACTIVE_CENTER_NAME);

  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;

    if (stdIdx >= 0 && !data.has(code)) {
      const days = parseFloat(String(rows[i][stdIdx] ?? "").replace(/,/g, ""));
      if (Number.isFinite(days)) data.set(code, { shipment_standard_days: days });
    }

    if (centerIdx >= 0) {
      const center = normalizeCenterName(rows[i][centerIdx]);
      // 센터명이 비어있거나 "미사용_화성2(상온)" 이 아닌 행이 있으면 활성 SKU 로 등록
      if (center && center !== inactiveNormalized) {
        activeSkus.add(code);
      }
    } else {
      // 센터명 컬럼이 없는 파일은 행이 있다는 사실만으로 활성으로 간주
      activeSkus.add(code);
    }
  }

  return { data, activeSkus, filePresent: true };
}

async function getInventory(key: string): Promise<InventoryParsed> {
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

async function getWorkcenter(key: string): Promise<WorkcenterParsed> {
  if (workcenterMemCache && workcenterMemCache.key === key) return workcenterMemCache.data;
  const data = await fetchAndParseWorkcenter(key);
  workcenterMemCache = { key, data };
  return data;
}

// ── 매핑표 ─────────────────────────────────────────────────────────────
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
  if (!digits) return "";
  return digits.padStart(7, "0").slice(0, 2);
}

function isFullBoxYes(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "예" || v === "y" || v === "yes" || v === "true" || v === "1" || v === "o";
}

// ── 집계 ───────────────────────────────────────────────────────────────
function tally(
  inventory: InventoryParsed,
  strategy: Map<string, StrategyRow>,
  workcenter: WorkcenterParsed,
  todayISO: string
): {
  counts: ChecklistCounts;
  sources: ChecklistSources;
  details: ChecklistDetails;
} {
  const details: ChecklistDetails = {
    location_missing: [],
    work_type_missing: [],
    work_type_misconfigured: [],
    full_box_missing: [],
    shipment_below_standard: [],
  };

  // 상품코드 단위 검사 (로케이션/작업구분/완박스)
  for (const [code, sku] of inventory.byCode) {
    const row = strategy.get(code);
    const productName = row?.product_name || sku.product_name || "";

    // 상품명에 "공P" 가 포함된 SKU 는 작업구분 미지정 카운트에서 제외 (공병/특수 처리 품목)
    const isGongP = productName.replace(/\s+/g, "").includes("공P");
    // 작업센터마스터에 활성 센터로 등록되지 않은 SKU 는 피킹셀·작업구분 미지정에서 제외.
    // 등록 자체가 없는 SKU 도 자동으로 제외됨. 단 마스터 파일이 미업로드 상태면 필터 미적용.
    const inWorkcenter = !workcenter.filePresent || workcenter.activeSkus.has(code);
    const skipLocation = !inWorkcenter;
    const skipWorkType = !inWorkcenter || isGongP;

    if (!row) {
      // 전략관리 미등록은 로케이션 + 작업구분 둘 다 미지정으로 간주
      if (!skipLocation) {
        details.location_missing.push({ product_code: code, product_name: productName });
      }
      if (!skipWorkType) {
        details.work_type_missing.push({ product_code: code, product_name: productName });
      }
    } else {
      // 1) 로케이션 미지정
      if (!row.picking_cell && !skipLocation) {
        details.location_missing.push({
          product_code: code,
          product_name: productName,
        });
      }
      // 2) 작업구분 미지정 (상품명 "공P" 또는 미사용 전용 SKU 제외)
      if (!row.work_type && !skipWorkType) {
        details.work_type_missing.push({
          product_code: code,
          product_name: productName,
          picking_cell: row.picking_cell,
        });
      } else if (row.work_type && row.picking_cell) {
        // 3) 작업구분 설정오류
        const prefix = getCellPrefix(row.picking_cell);
        const expected = CELL_PREFIX_TO_WORK_TYPE[prefix];
        if (expected && normalizeWorkType(expected) !== normalizeWorkType(row.work_type)) {
          details.work_type_misconfigured.push({
            product_code: code,
            product_name: productName,
            picking_cell: row.picking_cell,
            work_type: row.work_type,
            expected_work_type: expected,
          });
        }
      }
      // 4) 완박스작업 미지정
      if (row.picking_cell) {
        const prefix = getCellPrefix(row.picking_cell);
        if (FULL_BOX_REQUIRED_PREFIXES.has(prefix) && !isFullBoxYes(row.full_box_yn)) {
          details.full_box_missing.push({
            product_code: code,
            product_name: productName,
            picking_cell: row.picking_cell,
            full_box_yn: row.full_box_yn,
          });
        }
      }
    }

  }

  // 5) 출고기준미달: (상품코드 + 소비기한) 별 합산된 로트 단위로 검사
  for (const lot of inventory.lots) {
    if (!lot.expiry_date) continue;
    const wc = workcenter.data.get(lot.product_code);
    if (!wc) continue;
    const cutoff = addDaysToISO(todayISO, wc.shipment_standard_days + 1);
    if (lot.expiry_date > cutoff) continue;
    const stratRow = strategy.get(lot.product_code);
    details.shipment_below_standard.push({
      product_code: lot.product_code,
      product_name: stratRow?.product_name || lot.product_name,
      picking_cell: stratRow?.picking_cell ?? "",
      expiry_date: lot.expiry_date,
      shipment_standard_days: wc.shipment_standard_days,
      cutoff_date: cutoff,
      qty: lot.qty,
      days_short: diffDaysISO(cutoff, lot.expiry_date),
    });
  }

  // 정렬
  details.location_missing.sort((a, b) => a.product_code.localeCompare(b.product_code));
  details.work_type_missing.sort((a, b) => a.product_code.localeCompare(b.product_code));
  details.work_type_misconfigured.sort((a, b) => a.product_code.localeCompare(b.product_code));
  // 완박스작업 미지정: 피킹셀 오름차순
  details.full_box_missing.sort((a, b) =>
    (a.picking_cell ?? "").localeCompare(b.picking_cell ?? "", "ko", { numeric: true })
  );
  // 출고기준미달: 피킹셀 오름차순
  details.shipment_below_standard.sort((a, b) =>
    (a.picking_cell ?? "").localeCompare(b.picking_cell ?? "", "ko", { numeric: true })
  );

  return {
    counts: {
      location_missing: details.location_missing.length,
      work_type_missing: details.work_type_missing.length,
      work_type_misconfigured: details.work_type_misconfigured.length,
      full_box_missing: details.full_box_missing.length,
      shipment_below_standard: details.shipment_below_standard.length,
    },
    sources: {
      inventory_stock_count: inventory.byCode.size,
      strategy_count: strategy.size,
    },
    details,
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
 * 통합체크리스트 카운트 + 상세 계산.
 * R2 결과 캐시(파일 R2 key 기준) 우선, miss 시 파싱·계산 후 저장.
 * @param opts.force true 시 캐시 무시하고 강제 재계산 (cron 워밍 등)
 */
export async function computeChecklistCounts(opts?: { force?: boolean }): Promise<{
  counts: ChecklistCounts;
  sources: ChecklistSources;
  details: ChecklistDetails;
  cache_hit: boolean;
}> {
  const [inventoryKey, strategyKey, workcenterKey] = await Promise.all([
    getLatestKey("file-uploads/inventory-status/"),
    getLatestKey("file-uploads/product-strategy/"),
    getLatestKey("file-uploads/workcenter-product-master/"),
  ]);

  const todayISO = todayKstISO();

  // R2 캐시 조회 (force 모드면 스킵). 출고기준미달은 날짜 기반이라 캐시 entry 의 computed_at 일자가 오늘과 같을 때만 유효.
  if (!opts?.force && inventoryKey && strategyKey) {
    const cached = await readCountsCache();
    if (
      cached &&
      cached.inventory_key === inventoryKey &&
      cached.strategy_key === strategyKey &&
      cached.workcenter_key === (workcenterKey ?? "") &&
      cached.computed_at.slice(0, 10) === todayISO
    ) {
      return { counts: cached.counts, sources: cached.sources, details: cached.details, cache_hit: true };
    }
  }

  if (!inventoryKey || !strategyKey) {
    const empty: ChecklistDetails = {
      location_missing: [],
      work_type_missing: [],
      work_type_misconfigured: [],
      full_box_missing: [],
      shipment_below_standard: [],
    };
    return {
      counts: {
        location_missing: 0,
        work_type_missing: 0,
        work_type_misconfigured: 0,
        full_box_missing: 0,
        shipment_below_standard: 0,
      },
      sources: { inventory_stock_count: 0, strategy_count: 0 },
      details: empty,
      cache_hit: false,
    };
  }

  const [inventory, strategy, workcenter] = await Promise.all([
    getInventory(inventoryKey),
    getStrategy(strategyKey),
    workcenterKey
      ? getWorkcenter(workcenterKey)
      : Promise.resolve<WorkcenterParsed>({ data: new Map(), activeSkus: new Set(), filePresent: false }),
  ]);

  const { counts, sources, details } = tally(inventory, strategy, workcenter, todayISO);

  await writeCountsCache({
    inventory_key: inventoryKey,
    strategy_key: strategyKey,
    workcenter_key: workcenterKey ?? "",
    counts,
    sources,
    details,
    computed_at: new Date().toISOString(),
  });

  return { counts, sources, details, cache_hit: false };
}
