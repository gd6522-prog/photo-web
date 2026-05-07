import * as XLSX from "xlsx";
import { getR2ObjectBuffer, getR2ObjectText, listR2Keys, putR2Object } from "@/lib/r2";

// ── R2 결과 캐시 (모든 인스턴스 공유) ────────────────────────────────────
// v2: unit_cost (매입원가) 필드 추가
const R2_RESULT_CACHE_KEY = "file-uploads/_inventory-check-cache-v2.json";
type ResultCacheEntry = {
  strategy_key: string;
  workcenter_key: string;
  inventory_key: string;
  product_master_key: string;
  rows_by_part: Record<string, InventoryCheckRow[]>;
};

// ── 작업파트별 피킹셀 prefix 매핑 ─────────────────────────────────────────
export type WorkPartKey =
  | "box_manual" // 박스수기 (01, 02, 03)
  | "box_zone" // 박스존 (04, 05)
  | "inner_zone" // 이너존 (07)
  | "slide_zone" // 슬라존 (21~25)
  | "light_zone" // 경량존 (40~52)
  | "irregular_zone" // 이형존 (61)
  | "tobacco_zone" // 담배존 (71, 72)
  | "etc"; // 그외

export const WORK_PART_LABEL: Record<WorkPartKey, string> = {
  box_manual: "박스수기",
  box_zone: "박스존",
  inner_zone: "이너존",
  slide_zone: "슬라존",
  light_zone: "경량존",
  irregular_zone: "이형존",
  tobacco_zone: "담배존",
  etc: "그외",
};

const WORK_PART_PREFIXES: Record<Exclude<WorkPartKey, "etc">, string[]> = {
  box_manual: ["01", "02", "03"],
  box_zone: ["04", "05"],
  inner_zone: ["07"],
  slide_zone: ["21", "22", "23", "24", "25"],
  light_zone: [
    "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52",
  ],
  irregular_zone: ["61"],
  tobacco_zone: ["71", "72"],
};

const ALL_KNOWN_PREFIXES = new Set<string>(
  Object.values(WORK_PART_PREFIXES).flat()
);

export function workPartByPrefix(prefix: string): WorkPartKey {
  for (const [key, prefixes] of Object.entries(WORK_PART_PREFIXES) as [
    Exclude<WorkPartKey, "etc">,
    string[]
  ][]) {
    if (prefixes.includes(prefix)) return key;
  }
  return "etc";
}

export function getCellPrefix(cell: string): string {
  const digits = cell.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(7, "0").slice(0, 2);
}

// ── 헬퍼 ───────────────────────────────────────────────────────────────
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function findHeaderIndex(headers: string[], labels: string[]): number {
  for (const label of labels) {
    const i = headers.indexOf(normalizeHeader(label));
    if (i >= 0) return i;
  }
  return -1;
}

function normalizeDate(value: unknown): string {
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

async function getLatestKey(prefix: string): Promise<string | null> {
  const keys = await listR2Keys(prefix);
  if (keys.length === 0) return null;
  return [...keys].sort().reverse()[0];
}

// ── 인메모리 캐시: 파일 R2 key 가 같으면 재파싱 안 함 ─────────────────────
// (Vercel 서버리스 — 동일 Lambda 인스턴스가 재사용될 때만 효과. 다른 인스턴스는 재파싱.)
let strategyMemCache: { key: string; data: Map<string, StrategyRow> } | null = null;
let workcenterMemCache: { key: string; data: Map<string, WorkcenterRow> } | null = null;
let inventoryMemCache: { key: string; data: InvLot[] } | null = null;
let productMasterMemCache: { key: string; data: Map<string, number> } | null = null;

// ── 파싱: 상품별 전략관리 ──────────────────────────────────────────────
type StrategyRow = { product_name: string; picking_cell: string };

async function parseStrategyByKey(key: string): Promise<Map<string, StrategyRow>> {
  const map = new Map<string, StrategyRow>();
  const buf = await getR2ObjectBuffer(key);
  if (!buf) return map;
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return map;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return map;
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const nameIdx = findHeaderIndex(headers, ["상품명"]);
  const cellIdx = findHeaderIndex(headers, ["피킹셀"]);
  if (codeIdx < 0) return map;
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    map.set(code, {
      product_name: nameIdx >= 0 ? String(rows[i][nameIdx] ?? "").trim() : "",
      picking_cell: cellIdx >= 0 ? String(rows[i][cellIdx] ?? "").trim() : "",
    });
  }
  return map;
}

async function getStrategy(): Promise<Map<string, StrategyRow>> {
  const key = await getLatestKey("file-uploads/product-strategy/");
  if (!key) return new Map();
  if (strategyMemCache && strategyMemCache.key === key) return strategyMemCache.data;
  const data = await parseStrategyByKey(key);
  strategyMemCache = { key, data };
  return data;
}

// ── 파싱: 작업센터별 취급상품 마스터 ────────────────────────────────────
type WorkcenterRow = { box_unit: number; picking_unit: number };

async function parseWorkcenterByKey(key: string): Promise<Map<string, WorkcenterRow>> {
  const map = new Map<string, WorkcenterRow>();
  const buf = await getR2ObjectBuffer(key);
  if (!buf) return map;
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return map;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return map;
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  // 박스입수 = 센터발주입수, 피킹입수 = 점포발주입수
  const boxIdx = findHeaderIndex(headers, ["센터발주입수", "외박스입수", "발주입수"]);
  const pickIdx = findHeaderIndex(headers, ["점포발주입수", "센터피킹입수", "피킹입수"]);
  if (codeIdx < 0) return map;
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    if (map.has(code)) continue;
    const boxRaw = boxIdx >= 0 ? String(rows[i][boxIdx] ?? "").replace(/,/g, "") : "0";
    const pickRaw = pickIdx >= 0 ? String(rows[i][pickIdx] ?? "").replace(/,/g, "") : "0";
    const box = parseFloat(boxRaw);
    const pick = parseFloat(pickRaw);
    map.set(code, {
      box_unit: Number.isFinite(box) ? box : 0,
      picking_unit: Number.isFinite(pick) ? pick : 0,
    });
  }
  return map;
}

async function getWorkcenter(): Promise<Map<string, WorkcenterRow>> {
  const key = await getLatestKey("file-uploads/workcenter-product-master/");
  if (!key) return new Map();
  if (workcenterMemCache && workcenterMemCache.key === key) return workcenterMemCache.data;
  const data = await parseWorkcenterByKey(key);
  workcenterMemCache = { key, data };
  return data;
}

// ── 파싱: 재고현황 — (상품코드 + 소비기한) 별 가용수량 합산 ─────────────
type InvLot = {
  product_code: string;
  expiry_date: string; // YYYY-MM-DD
  qty: number; // 가용수량 합계
};

async function parseInventoryByKey(key: string): Promise<InvLot[]> {
  const buf = await getR2ObjectBuffer(key);
  if (!buf) return [];
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const qtyIdx = findHeaderIndex(headers, ["가용수량", "가용재고"]);
  const expiryIdx = findHeaderIndex(headers, ["소비기한", "유통기한"]);
  if (codeIdx < 0 || qtyIdx < 0) return [];

  const lotMap = new Map<string, InvLot>();
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code) continue;
    const qtyRaw = String(rows[i][qtyIdx] ?? "").replace(/,/g, "");
    const qty = parseFloat(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const expiry = expiryIdx >= 0 ? normalizeDate(rows[i][expiryIdx]) : "";
    const lotKey = `${code}|${expiry}`;
    const existing = lotMap.get(lotKey);
    if (!existing) {
      lotMap.set(lotKey, { product_code: code, expiry_date: expiry, qty });
    } else {
      existing.qty += qty;
    }
  }
  return [...lotMap.values()];
}

async function getInventory(): Promise<InvLot[]> {
  const key = await getLatestKey("file-uploads/inventory-status/");
  if (!key) return [];
  if (inventoryMemCache && inventoryMemCache.key === key) return inventoryMemCache.data;
  const data = await parseInventoryByKey(key);
  inventoryMemCache = { key, data };
  return data;
}

// ── 파싱: 상품마스터 (매입원가 추출) ─────────────────────────────────────
async function parseProductMasterByKey(key: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const buf = await getR2ObjectBuffer(key);
  if (!buf) return map;
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return map;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) return map;
  const headers = rows[0].map(normalizeHeader);
  const codeIdx = findHeaderIndex(headers, ["상품코드"]);
  const costIdx = findHeaderIndex(headers, ["매입원가", "원가", "매입가"]);
  if (codeIdx < 0 || costIdx < 0) return map;
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i][codeIdx] ?? "").trim();
    if (!code || map.has(code)) continue;
    const raw = String(rows[i][costIdx] ?? "").replace(/,/g, "");
    const v = parseFloat(raw);
    if (Number.isFinite(v)) map.set(code, v);
  }
  return map;
}

async function getProductMasterCost(): Promise<Map<string, number>> {
  const key = await getLatestKey("file-uploads/product-master/");
  if (!key) return new Map();
  if (productMasterMemCache && productMasterMemCache.key === key) return productMasterMemCache.data;
  const data = await parseProductMasterByKey(key);
  productMasterMemCache = { key, data };
  return data;
}

// ── 컴퓨테이션: 박스수량 / 낱개수량 분해 ───────────────────────────────
function decomposeQty(qty: number, boxUnit: number, pickUnit: number): { boxCount: number; unitCount: number } {
  let remaining = qty;
  let boxCount = 0;
  if (boxUnit > 0) {
    boxCount = Math.floor(remaining / boxUnit);
    remaining = remaining - boxCount * boxUnit;
  }
  let unitCount = 0;
  if (pickUnit > 0) {
    unitCount = Math.floor(remaining / pickUnit);
  } else {
    unitCount = remaining; // 피킹입수가 0/누락이면 잔여 그대로
  }
  return { boxCount, unitCount };
}

// ── 결과 행 ───────────────────────────────────────────────────────────
export type InventoryCheckRow = {
  picking_cell: string;
  product_code: string;
  product_name: string;
  box_unit: number;
  picking_unit: number;
  expiry_date: string; // 전산소비기한
  computed_qty: number; // 전산수량
  box_count: number; // 박스수량
  unit_count: number; // 낱개수량
  unit_cost: number; // 매입원가 (상품마스터)
};

async function buildAllPartsRows(): Promise<Record<string, InventoryCheckRow[]>> {
  const [strategy, workcenter, lots, costs] = await Promise.all([
    getStrategy(),
    getWorkcenter(),
    getInventory(),
    getProductMasterCost(),
  ]);

  const byPart: Record<string, InventoryCheckRow[]> = {};
  for (const lot of lots) {
    const strat = strategy.get(lot.product_code);
    if (!strat || !strat.picking_cell) continue;
    const prefix = getCellPrefix(strat.picking_cell);
    const part = ALL_KNOWN_PREFIXES.has(prefix) ? workPartByPrefix(prefix) : "etc";
    const wc = workcenter.get(lot.product_code);
    const boxUnit = wc?.box_unit ?? 0;
    const pickUnit = wc?.picking_unit ?? 0;
    const { boxCount, unitCount } = decomposeQty(lot.qty, boxUnit, pickUnit);
    if (!byPart[part]) byPart[part] = [];
    byPart[part].push({
      picking_cell: strat.picking_cell,
      product_code: lot.product_code,
      product_name: strat.product_name,
      box_unit: boxUnit,
      picking_unit: pickUnit,
      expiry_date: lot.expiry_date,
      computed_qty: lot.qty,
      box_count: boxCount,
      unit_count: unitCount,
      unit_cost: costs.get(lot.product_code) ?? 0,
    });
  }

  // 피킹셀 → 상품코드 → 소비기한 순 정렬
  for (const part of Object.keys(byPart)) {
    byPart[part].sort((a, b) => {
      const cellCmp = a.picking_cell.localeCompare(b.picking_cell, "ko", { numeric: true });
      if (cellCmp !== 0) return cellCmp;
      const codeCmp = a.product_code.localeCompare(b.product_code);
      if (codeCmp !== 0) return codeCmp;
      return a.expiry_date.localeCompare(b.expiry_date);
    });
  }
  return byPart;
}

export async function buildInventoryCheckRows(part: WorkPartKey): Promise<InventoryCheckRow[]> {
  const [stratKey, wcKey, invKey, pmKey] = await Promise.all([
    getLatestKey("file-uploads/product-strategy/"),
    getLatestKey("file-uploads/workcenter-product-master/"),
    getLatestKey("file-uploads/inventory-status/"),
    getLatestKey("file-uploads/product-master/"),
  ]);

  if (stratKey && wcKey && invKey) {
    try {
      const cachedText = await getR2ObjectText(R2_RESULT_CACHE_KEY);
      if (cachedText) {
        const cached = JSON.parse(cachedText) as ResultCacheEntry;
        if (
          cached.strategy_key === stratKey &&
          cached.workcenter_key === wcKey &&
          cached.inventory_key === invKey &&
          cached.product_master_key === (pmKey ?? "")
        ) {
          return cached.rows_by_part[part] ?? [];
        }
      }
    } catch {
      // 캐시 읽기 실패는 무시하고 재계산
    }
  }

  const byPart = await buildAllPartsRows();
  if (stratKey && wcKey && invKey) {
    void putR2Object(
      R2_RESULT_CACHE_KEY,
      JSON.stringify({
        strategy_key: stratKey,
        workcenter_key: wcKey,
        inventory_key: invKey,
        product_master_key: pmKey ?? "",
        rows_by_part: byPart,
      } as ResultCacheEntry),
      "application/json"
    );
  }
  return byPart[part] ?? [];
}
