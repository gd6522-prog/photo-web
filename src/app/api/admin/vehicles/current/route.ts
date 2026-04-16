import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { json, requireAdmin } from "../../notices/_shared";
import { getR2ObjectText, getR2ObjectBuffer, putR2Object, deleteR2Object, getViewPresignedUrl, listR2Keys } from "@/lib/r2";

export const runtime = "nodejs";

const R2_PREFIX = "vehicle-data";
const CURRENT_PATH = `${R2_PREFIX}/current/latest.json`;
const LIMITS_PATH = `${R2_PREFIX}/current/limits.json`;

function kstTodayYYYYMMDD(isoNow?: string) {
  const d = isoNow ? new Date(isoNow) : new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type ProductRow = {
  warehouse_code: string;
  outbound_no: string;
  outbound_detail_no: string;
  wave_no: string;
  wave_name: string;
  delivery_date: string;
  outbound_type: string;
  assign_status: string;
  delivery_round: string;
  car_no: string;
  seq_no: number;
  store_code: string;
  store_name: string;
  priority_code: string;
  slip_no: string;
  product_code: string;
  product_name: string;
  cell_name: string;
  order_unit: number;
  original_qty: number;
  current_qty: number;
  assigned_qty: number;
  picking_qty: number;
  diff_qty: number;
  confirmed_qty: number;
  store_check_qty: number;
  center_unit: number;
  outer_box_unit: number;
  work_type: string;
  facility_type: string;
  full_box_yn: string;
  shortage_type: string;
  shortage_reason: string;
  amount: number;
  outbound_condition: string;
  outbound_confirm_yn: string;
  delivery_due_time?: string;
  address?: string;
};

type CargoRow = {
  id: string;
  support_excluded?: boolean;
  note?: string;
  car_no: string;
  seq_no: number;
  store_code: string;
  store_name: string;
  large_box: number;
  large_inner: number;
  large_other: number;
  large_day2l: number;
  large_nb2l: number;
  small_low: number;
  small_high: number;
  event: number;
  tobacco: number;
  certificate: number;
  cdc: number;
  pbox: number;
  standard_time: string;
  address: string;
};

function buildReportBaseCargoRows(rows: Array<{
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time: string;
  address: string;
}>) {
  const unique = new Map<string, CargoRow>();

  for (const row of rows) {
    const carNo = toText(row.car_no);
    const storeName = toText(row.store_name);
    if (!carNo || !storeName) continue;

    const seqNo = toNumber(row.seq_no);
    const key = `${carNo}__${seqNo}__${storeName}`;
    if (unique.has(key)) continue;

    unique.set(key, {
      id: `base-${key}`,
      support_excluded: false,
      note: "",
      car_no: carNo,
      seq_no: seqNo,
      store_code: toText(row.store_code),
      store_name: storeName,
      large_box: 0,
      large_inner: 0,
      large_other: 0,
      large_day2l: 0,
      large_nb2l: 0,
      small_low: 0,
      small_high: 0,
      event: 0,
      tobacco: 0,
      certificate: 0,
      cdc: 0,
      pbox: 0,
      standard_time: toText(row.delivery_due_time),
      address: toText(row.address),
    });
  }

  return [...unique.values()].sort((a, b) => {
    const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
    if (carDiff !== 0) return carDiff;
    if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
    return a.store_name.localeCompare(b.store_name, "ko");
  });
}

type StoreMapMatch = {
  store_code: string;
  car_no: string;
  seq_no: number;
  delivery_due_time: string;
  address: string;
};

type VehicleSnapshot = {
  fileName: string;
  productRows: ProductRow[];
  cargoRows: CargoRow[];
  subtotalSettings?: Record<string, { support_excluded: boolean; note: string }>;
  uploadedAt: string;
  uploadedBy: string;
};

type VehicleLimitsSnapshot = {
  largeLimit?: number;
  smallLimit?: number;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = toText(value).replace(/,/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: unknown) {
  return toText(value).replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

function normalizeStoreName(value: unknown) {
  return toText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeStoreCode(value: unknown) {
  const raw = toText(value);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function getStoreMapLookupKey(storeCode: unknown, storeName: unknown) {
  const normalizedCode = normalizeStoreCode(storeCode);
  return normalizedCode || normalizeStoreName(storeName);
}

function findHeaderIndex(headers: string[], labels: string[]) {
  for (const label of labels) {
    const index = headers.indexOf(normalizeHeader(label));
    if (index >= 0) return index;
  }
  return -1;
}

function qtyBase(row: ProductRow) {
  const assigned = row.assigned_qty || row.confirmed_qty || row.current_qty || row.original_qty || 0;
  if (assigned <= 0) return 0;
  if (row.center_unit > 0) return assigned / row.center_unit;
  return assigned;
}

function parseProductRowsFromAOA(rows: unknown[][]) {
  if (!rows.length) return [];

  const headers = (rows[0] ?? []).map((cell) => normalizeHeader(cell));
  const idx = {
    warehouse_code: findHeaderIndex(headers, ["창고코드"]),
    outbound_no: findHeaderIndex(headers, ["출고번호"]),
    outbound_detail_no: findHeaderIndex(headers, ["출고상세번호"]),
    wave_no: findHeaderIndex(headers, ["웨이브번호"]),
    wave_name: findHeaderIndex(headers, ["웨이브명"]),
    delivery_date: findHeaderIndex(headers, ["납품예정일"]),
    outbound_type: findHeaderIndex(headers, ["출고유형"]),
    assign_status: findHeaderIndex(headers, ["할당상태"]),
    delivery_round: findHeaderIndex(headers, ["배송횟수"]),
    car_no: findHeaderIndex(headers, ["호차"]),
    seq_no: findHeaderIndex(headers, ["순번"]),
    store_code: findHeaderIndex(headers, ["점포코드"]),
    store_name: findHeaderIndex(headers, ["점포명"]),
    priority_code: findHeaderIndex(headers, ["출고우선등급코드"]),
    slip_no: findHeaderIndex(headers, ["전표번호"]),
    product_code: findHeaderIndex(headers, ["상품코드"]),
    product_name: findHeaderIndex(headers, ["상품명"]),
    cell_name: findHeaderIndex(headers, ["셀", "셀명"]),
    order_unit: findHeaderIndex(headers, ["점포발주입수"]),
    original_qty: findHeaderIndex(headers, ["원주문수량"]),
    current_qty: findHeaderIndex(headers, ["현주문수량"]),
    assigned_qty: findHeaderIndex(headers, ["할당수량"]),
    picking_qty: findHeaderIndex(headers, ["피킹수량"]),
    diff_qty: findHeaderIndex(headers, ["차이수량"]),
    confirmed_qty: findHeaderIndex(headers, ["피킹확정수량"]),
    store_check_qty: findHeaderIndex(headers, ["점포검수수량"]),
    center_unit: findHeaderIndex(headers, ["센터피킹입수"]),
    outer_box_unit: findHeaderIndex(headers, ["외박스입수"]),
    work_type: findHeaderIndex(headers, ["작업구분"]),
    facility_type: findHeaderIndex(headers, ["설비유형"]),
    full_box_yn: findHeaderIndex(headers, ["풀박스작업여부"]),
    shortage_type: findHeaderIndex(headers, ["결품유형코드"]),
    shortage_reason: findHeaderIndex(headers, ["결품사유"]),
    amount: findHeaderIndex(headers, ["출고금액"]),
    outbound_condition: findHeaderIndex(headers, ["출고확정조건내역"]),
    outbound_confirm_yn: findHeaderIndex(headers, ["출고확정여부"]),
  };

  if (idx.store_code < 0 || idx.store_name < 0 || idx.product_code < 0 || idx.product_name < 0) {
    throw new Error("단품별 파일에서 필수 컬럼을 찾지 못했습니다.");
  }

  const parsed: ProductRow[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const storeCode = toText(row[idx.store_code]);
    const storeName = toText(row[idx.store_name]);
    const productCode = toText(row[idx.product_code]);
    const productName = toText(row[idx.product_name]);

    if (!storeCode && !storeName && !productCode && !productName) continue;
    if (!storeName) continue;

    parsed.push({
      warehouse_code: toText(row[idx.warehouse_code]),
      outbound_no: toText(row[idx.outbound_no]),
      outbound_detail_no: toText(row[idx.outbound_detail_no]),
      wave_no: toText(row[idx.wave_no]),
      wave_name: toText(row[idx.wave_name]),
      delivery_date: toText(row[idx.delivery_date]),
      outbound_type: toText(row[idx.outbound_type]),
      assign_status: toText(row[idx.assign_status]),
      delivery_round: toText(row[idx.delivery_round]),
      car_no: toText(row[idx.car_no]),
      seq_no: toNumber(row[idx.seq_no]),
      store_code: storeCode,
      store_name: storeName,
      priority_code: toText(row[idx.priority_code]),
      slip_no: toText(row[idx.slip_no]),
      product_code: productCode,
      product_name: productName,
      cell_name: toText(row[idx.cell_name]),
      order_unit: toNumber(row[idx.order_unit]),
      original_qty: toNumber(row[idx.original_qty]),
      current_qty: toNumber(row[idx.current_qty]),
      assigned_qty: toNumber(row[idx.assigned_qty]),
      picking_qty: toNumber(row[idx.picking_qty]),
      diff_qty: toNumber(row[idx.diff_qty]),
      confirmed_qty: toNumber(row[idx.confirmed_qty]),
      store_check_qty: toNumber(row[idx.store_check_qty]),
      center_unit: toNumber(row[idx.center_unit]),
      outer_box_unit: toNumber(row[idx.outer_box_unit]),
      work_type: toText(row[idx.work_type]),
      facility_type: toText(row[idx.facility_type]),
      full_box_yn: toText(row[idx.full_box_yn]),
      shortage_type: toText(row[idx.shortage_type]),
      shortage_reason: toText(row[idx.shortage_reason]),
      amount: toNumber(row[idx.amount]),
      outbound_condition: toText(row[idx.outbound_condition]),
      outbound_confirm_yn: toText(row[idx.outbound_confirm_yn]),
    });
  }

  return parsed;
}

function parseWorkbookProductRows(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error("단품별 파일을 읽지 못했습니다.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  }) as unknown[][];

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    return normalized.includes(normalizeHeader("점포코드")) && normalized.includes(normalizeHeader("점포명"));
  });

  if (headerRowIndex < 0) {
    throw new Error("단품별 헤더를 찾지 못했습니다.");
  }

  return parseProductRowsFromAOA(rows.slice(headerRowIndex));
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

function mergeStoreMapRows(index: Map<string, StoreMapMatch>, rows: any[]) {
  for (const row of rows ?? []) {
    const payload = {
      store_code: toText((row as any).store_code),
      car_no: toText((row as any).car_no),
      seq_no: toNumber((row as any).seq_no),
      delivery_due_time: toText((row as any).delivery_due_time),
      address: toText((row as any).address),
    } satisfies StoreMapMatch;

    const codeKey = normalizeStoreCode((row as any).store_code);
    if (codeKey) index.set(codeKey, payload);

    const nameKey = normalizeStoreName((row as any).store_name);
    if (nameKey) index.set(nameKey, payload);
  }
}

async function fetchStoreMapIndexByRows(sbAdmin: any, rows: Array<Pick<ProductRow, "store_code" | "store_name">>) {
  const index = new Map<string, StoreMapMatch>();
  const storeCodes = [...new Set(rows.map((row) => normalizeStoreCode(row.store_code)).filter(Boolean))];
  const storeNames = [
    ...new Set(
      rows
        .filter((row) => !normalizeStoreCode(row.store_code))
        .map((row) => toText(row.store_name))
        .filter(Boolean)
    ),
  ];

  for (const codes of chunkValues(storeCodes, 200)) {
    const { data, error } = await sbAdmin
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no, delivery_due_time, address")
      .in("store_code", codes);
    if (error) throw new Error("점포 마스터를 불러오지 못했습니다.");
    mergeStoreMapRows(index, data ?? []);
  }

  for (const names of chunkValues(storeNames, 100)) {
    const { data, error } = await sbAdmin
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no, delivery_due_time, address")
      .in("store_name", names);
    if (error) throw new Error("점포 마스터를 불러오지 못했습니다.");
    mergeStoreMapRows(index, data ?? []);
  }

  return index;
}

function applyStoreMap(rows: ProductRow[], storeMapIndex: Map<string, StoreMapMatch>) {
  let matchedCount = 0;

  const mappedRows = rows.map((row) => {
    const match = storeMapIndex.get(getStoreMapLookupKey(row.store_code, row.store_name));
    if (!match) return row;

    matchedCount += 1;
    return {
      ...row,
      car_no: match.car_no || row.car_no,
      seq_no: match.seq_no || row.seq_no,
      delivery_due_time: match.delivery_due_time || row.delivery_due_time,
      address: match.address || row.address,
    };
  });

  return { mappedRows, matchedCount };
}

function updateCargoByProduct(target: CargoRow, row: ProductRow) {
  const qty = qtyBase(row);
  if (qty <= 0) return;

  const workType = row.work_type.replace(/\s+/g, "").toLowerCase();
  const productCode = row.product_code.trim();
  const productName = row.product_name.replace(/\s+/g, "").toLowerCase();

  if (productCode === "8809169711091" || productName.includes("옐로우)올데이워터생수펫2l")) {
    target.large_day2l += qty;
    return;
  }

  if (productCode === "8809482500938" || productName.includes("노브랜드)미네랄워터펫2l(qr)")) {
    target.large_nb2l += qty;
    return;
  }

  if (workType.includes("박스수기") || workType.includes("박스존1")) {
    target.large_box += qty;
    return;
  }

  if (workType.includes("이너존a")) {
    target.large_inner += qty;
    return;
  }

  if (workType.includes("이형존")) {
    target.large_other += qty;
    return;
  }

  if (workType.includes("경량존a")) {
    target.small_low += qty;
    return;
  }

  if (workType.includes("슬라존a")) {
    target.small_high += qty;
    return;
  }

  if (workType.includes("행사a")) {
    target.event += qty;
    return;
  }

  if (workType.includes("담배존") || workType.includes("담배수기")) {
    target.tobacco += qty;
    return;
  }

  if (workType.includes("유가증권")) {
    target.certificate += qty;
    return;
  }

  if (workType.includes("cdc")) {
    target.cdc += qty;
    return;
  }

  if (workType.includes("피박스")) {
    target.pbox += qty;
    return;
  }

  target.large_other += qty;
}

function buildCargoDraft(rows: ProductRow[]) {
  const grouped = new Map<string, CargoRow>();

  for (const row of rows) {
    const key = `${row.car_no}__${row.seq_no}__${row.store_name}`;
    const current =
      grouped.get(key) ??
      {
        id: key,
        support_excluded: false,
        note: "",
        car_no: row.car_no,
        seq_no: row.seq_no,
        store_code: row.store_code,
        store_name: row.store_name,
        large_box: 0,
        large_inner: 0,
        large_other: 0,
        large_day2l: 0,
        large_nb2l: 0,
        small_low: 0,
        small_high: 0,
        event: 0,
        tobacco: 0,
        certificate: 0,
        cdc: 0,
        pbox: 0,
        standard_time: row.delivery_due_time || "",
        address: row.address || "",
      };

    updateCargoByProduct(current, row);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => {
    const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
    if (carDiff !== 0) return carDiff;
    if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
    return a.store_name.localeCompare(b.store_name, "ko");
  });
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "_");
}

function normDeliveryDate(v: string): string {
  // 슬래시·점 → 하이픈 통일, 시간 부분 제거 ("2026-04-15 00:00:00" → "2026-04-15")
  const s = String(v ?? "").trim().replace(/[\/\.]/g, "-").split(/[ T]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return "";
}

async function readCurrentSnapshot() {
  const text = await getR2ObjectText(CURRENT_PATH);
  if (!text) return null;
  return JSON.parse(text) as VehicleSnapshot;
}

async function readCurrentLimits() {
  const text = await getR2ObjectText(LIMITS_PATH);
  if (!text) return null;
  return JSON.parse(text) as VehicleLimitsSnapshot;
}

async function getCurrentObjectNames() {
  const keys = await listR2Keys(`${R2_PREFIX}/current/`);
  return new Set(keys.map((k) => k.split("/").pop() ?? "").filter(Boolean));
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const includeSnapshot = req.nextUrl.searchParams.get("includeSnapshot") === "1";
    const includeLimits = req.nextUrl.searchParams.get("includeLimits") === "1";
    const includeReportBase = req.nextUrl.searchParams.get("includeReportBase") === "1";
    const dateParam = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    const names = await getCurrentObjectNames();
    let snapshotUrl: string | null = null;
    let limitsUrl: string | null = null;
    let snapshot: VehicleSnapshot | null = null;
    let limits: VehicleLimitsSnapshot | null = null;
    let reportBaseRows: CargoRow[] = [];

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      // 날짜별 스냅샷만 읽기 — 해당 날짜 파일 없으면 null (fallback 없음)
      if (includeSnapshot) {
        const text = await getR2ObjectText(`${R2_PREFIX}/daily/${dateParam}.json`);
        if (text) {
          try { snapshot = JSON.parse(text) as VehicleSnapshot; } catch {}
        }
      }
    } else if (names.has("latest.json")) {
      if (includeSnapshot) {
        snapshot = await readCurrentSnapshot();
      } else {
        snapshotUrl = await getViewPresignedUrl(CURRENT_PATH, 60);
      }
    }

    if (names.has("limits.json")) {
      if (includeLimits) {
        limits = await readCurrentLimits();
      } else {
        limitsUrl = await getViewPresignedUrl(LIMITS_PATH, 60);
      }
    }

    let validStoreCodes: string[] | null = null;

    if (includeReportBase) {
      const { data, error } = await guard.sbAdmin
        .from("store_map")
        .select("store_code, store_name, car_no, seq_no, delivery_due_time, address")
        .not("car_no", "is", null)
        .not("store_name", "is", null)
        .order("car_no", { ascending: true })
        .order("seq_no", { ascending: true })
        .order("store_name", { ascending: true });

      if (error) throw new Error(error.message);
      reportBaseRows = buildReportBaseCargoRows(
        (data ?? []) as Array<{
          store_code: string;
          store_name: string;
          car_no: string;
          seq_no: number;
          delivery_due_time: string;
          address: string;
        }>
      );
      // store_map 유효 코드 목록 (클라이언트 필터링용)
      validStoreCodes = (data ?? []).map((r: any) => normalizeStoreCode(toText(r.store_code))).filter(Boolean);
    }

    return json(true, undefined, { snapshotUrl, limitsUrl, snapshot, limits, reportBaseRows, validStoreCodes });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      snapshot?: VehicleSnapshot | null;
      fileName?: string;
      cargoRows?: CargoRow[] | null;
      subtotalSettings?: Record<string, { support_excluded: boolean; note: string }> | null;
      limits?: VehicleLimitsSnapshot | null;
    };

    // ── action: rebuild-daily — latest.json에서 daily 파일 재생성 ────────
    if ((body as any).action === "rebuild-daily") {
      const snapshot = await readCurrentSnapshot();
      if (!snapshot) return json(false, "현재 스냅샷이 없습니다.", null, 404);

      const byDeliveryDate = new Map<string, ProductRow[]>();
      for (const row of snapshot.productRows ?? []) {
        const dd = normDeliveryDate(row.delivery_date);
        if (!dd) continue;
        if (!byDeliveryDate.has(dd)) byDeliveryDate.set(dd, []);
        byDeliveryDate.get(dd)!.push(row);
      }

      const dates: string[] = [];
      await Promise.all(
        [...byDeliveryDate.entries()].map(async ([dd, rows]) => {
          const dailySnap: VehicleSnapshot = { ...snapshot, productRows: rows };
          await putR2Object(`${R2_PREFIX}/daily/${dd}.json`, JSON.stringify(dailySnap), "application/json");
          dates.push(dd);
        })
      );

      return json(true, undefined, { dates });
    }

    if (body.snapshot) {
      await putR2Object(CURRENT_PATH, JSON.stringify(body.snapshot), "application/json");

      // store_map은 백그라운드에서 처리 (응답 지연 없음)
      const storeUpdates = (body.snapshot.cargoRows ?? [])
        .filter((row) => toText(row.store_code) && toText(row.store_name) && toText(row.car_no) && Number.isFinite(Number(row.seq_no)))
        .map((row) => ({
          store_code: toText(row.store_code),
          store_name: toText(row.store_name),
          car_no: toText(row.car_no),
          seq_no: Number(row.seq_no || 0),
          delivery_due_time: toText(row.standard_time),
          address: toText(row.address),
          updated_at: new Date().toISOString(),
        }));
      if (storeUpdates.length > 0) {
        void guard.sbAdmin.from("store_map").upsert(storeUpdates, { onConflict: "store_code" });
      }
    } else if (Array.isArray(body.cargoRows)) {
      // cargoRows만 업데이트 (지원체크/기사 저장) — 기존 snapshot의 productRows는 유지
      const existing = await readCurrentSnapshot();
      if (!existing) throw new Error("기존 스냅샷이 없습니다. 먼저 파일을 업로드해 주세요.");

      // 실제 행은 incoming 기준으로 업데이트, 가상 부분합 행(subtotal-)은 제거
      const incomingMap = new Map(body.cargoRows.map((r) => [r.id, r]));
      const mergedRealRows = existing.cargoRows
        .filter((r) => !r.id.startsWith("subtotal-"))
        .map((row) => incomingMap.get(row.id) ?? row);

      const merged: VehicleSnapshot = {
        ...existing,
        fileName: body.fileName ?? existing.fileName,
        cargoRows: mergedRealRows,
        subtotalSettings: body.subtotalSettings ?? existing.subtotalSettings,
        uploadedAt: new Date().toISOString(),
      };
      await putR2Object(CURRENT_PATH, JSON.stringify(merged), "application/json");

      // 지원체크/기사 변경 시 daily 파일도 동기화
      const byDeliveryDate = new Map<string, typeof merged.productRows>();
      for (const row of merged.productRows ?? []) {
        const dd = normDeliveryDate(row.delivery_date);
        if (!dd) continue;
        if (!byDeliveryDate.has(dd)) byDeliveryDate.set(dd, []);
        byDeliveryDate.get(dd)!.push(row);
      }
      void Promise.all(
        [...byDeliveryDate.entries()].map(async ([dd, rows]) => {
          const dailySnap: VehicleSnapshot = { ...merged, productRows: rows };
          await putR2Object(`${R2_PREFIX}/daily/${dd}.json`, JSON.stringify(dailySnap), "application/json");
        })
      );
    }

    if (body.limits) {
      await putR2Object(LIMITS_PATH, JSON.stringify(body.limits), "application/json");
    }

    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let fileName = "";
    let buffer: ArrayBuffer | null = null;
    let isHistorical = false;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json(false, "파일이 없습니다.", null, 400);
      fileName = file.name;
      buffer = await file.arrayBuffer();
    } else {
      const body = (await req.json().catch(() => null)) as { path?: string; fileName?: string; historical?: boolean } | null;
      const path = toText(body?.path);
      fileName = toText(body?.fileName);
      isHistorical = body?.historical === true;
      if (!path) return json(false, "업로드 경로가 없습니다.", null, 400);

      const r2Buffer = await getR2ObjectBuffer(path);
      if (!r2Buffer) throw new Error("R2에서 파일을 찾을 수 없습니다.");
      buffer = r2Buffer.buffer as ArrayBuffer;
    }

    if (!buffer) return json(false, "파일을 읽지 못했습니다.", null, 400);

    const productRows = parseWorkbookProductRows(buffer);
    const storeMapIndex = await fetchStoreMapIndexByRows(guard.sbAdmin, productRows);
    const { mappedRows, matchedCount } = applyStoreMap(productRows, storeMapIndex);
    let cargoRows = buildCargoDraft(mappedRows);

    // 점포마스터 전체 조회 → 발주 없는 점포도 포함
    const { data: allStoreRows } = await guard.sbAdmin
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no, delivery_due_time, address");

    // 점포명 중복 시 store_code 높은 것만 유지
    const masterByName = new Map<string, { store_code: string; store_name: string; car_no: string; seq_no: number; delivery_due_time: string; address: string }>();
    for (const store of (allStoreRows ?? []) as { store_code: string; store_name: string; car_no: string; seq_no: number; delivery_due_time: string; address: string }[]) {
      const nameKey = normalizeStoreName(store.store_name);
      if (!nameKey) continue;
      const existing = masterByName.get(nameKey);
      if (!existing) {
        masterByName.set(nameKey, store);
      } else {
        const existingNum = parseInt(normalizeStoreCode(existing.store_code), 10) || 0;
        const newNum = parseInt(normalizeStoreCode(store.store_code), 10) || 0;
        if (newNum > existingNum) masterByName.set(nameKey, store);
      }
    }

    // 이미 cargoRows에 있는 점포명 제외하고 나머지 0건 행 추가
    const cargoNameSet = new Set(cargoRows.map((r) => normalizeStoreName(r.store_name)));
    const missingRows: CargoRow[] = [];
    for (const store of masterByName.values()) {
      if (cargoNameSet.has(normalizeStoreName(store.store_name))) continue;
      missingRows.push({
        id: `master__${normalizeStoreCode(store.store_code)}__${store.store_name}`,
        support_excluded: false,
        note: "",
        car_no: toText(store.car_no),
        seq_no: toNumber(store.seq_no),
        store_code: toText(store.store_code),
        store_name: toText(store.store_name),
        large_box: 0,
        large_inner: 0,
        large_other: 0,
        large_day2l: 0,
        large_nb2l: 0,
        small_low: 0,
        small_high: 0,
        event: 0,
        tobacco: 0,
        certificate: 0,
        cdc: 0,
        pbox: 0,
        standard_time: toText(store.delivery_due_time),
        address: toText(store.address),
      });
    }

    cargoRows = [...cargoRows, ...missingRows].sort((a, b) => {
      const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
      if (carDiff !== 0) return carDiff;
      if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
      return a.store_name.localeCompare(b.store_name, "ko");
    });

    const { data: profile } = await guard.sbAdmin.from("profiles").select("name").eq("id", guard.uid).maybeSingle();
    const uploadedAt = new Date().toISOString();
    const snapshot: VehicleSnapshot = {
      fileName: fileName || "vehicle.xlsx",
      productRows: mappedRows,
      cargoRows,
      uploadedAt,
      uploadedBy: toText((profile as any)?.name) || guard.email || guard.uid,
    };

    const stamp = uploadedAt.replace(/[:.]/g, "-");
    const safeName = sanitizeFileName(fileName || "vehicle.xlsx");
    const archivePath = `${R2_PREFIX}/snapshots/${stamp}.json`;
    const snapshotJson = JSON.stringify(snapshot);

    if (contentType.includes("multipart/form-data")) {
      const rawPath = `${R2_PREFIX}/uploads/${stamp}-${safeName}`;
      await putR2Object(rawPath, new Uint8Array(buffer), "application/octet-stream");
    }

    // 과거 데이터 업로드(historical)는 latest.json을 덮어쓰지 않음 — daily 파일만 저장
    if (!isHistorical) {
      await putR2Object(CURRENT_PATH, snapshotJson, "application/json");
    }
    await putR2Object(archivePath, snapshotJson, "application/json");

    // 납품예정일별 daily 파일 저장 — delivery_date 기준으로 그룹핑 후 각 날짜별 저장
    const byDeliveryDate = new Map<string, ProductRow[]>();
    for (const row of mappedRows) {
      const dd = normDeliveryDate(row.delivery_date);
      if (!dd) continue;
      if (!byDeliveryDate.has(dd)) byDeliveryDate.set(dd, []);
      byDeliveryDate.get(dd)!.push(row);
    }
    for (const [dd, rows] of byDeliveryDate) {
      const dailySnap: VehicleSnapshot = { ...snapshot, productRows: rows };
      void putR2Object(`${R2_PREFIX}/daily/${dd}.json`, JSON.stringify(dailySnap), "application/json");
    }

    return json(true, undefined, { snapshot, matchedCount });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    await deleteR2Object(CURRENT_PATH);
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
