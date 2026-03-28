import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

const BUCKET = "vehicle-data";
const CURRENT_PATH = "current/latest.json";
const LIMITS_PATH = "current/limits.json";

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

async function ensureBucket(sbAdmin: any) {
  const { data, error } = await sbAdmin.storage.listBuckets();
  if (error) throw new Error(error.message);
  const exists = (data ?? []).some((bucket: any) => bucket.name === BUCKET);
  if (exists) return;

  const { error: createError } = await sbAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: "50MB",
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "_");
}

async function readCurrentSnapshot(sbAdmin: any) {
  await ensureBucket(sbAdmin);
  const { data, error } = await sbAdmin.storage.from(BUCKET).download(CURRENT_PATH);
  if (error) {
    if (/not found|404/i.test(error.message)) return null;
    throw new Error(error.message);
  }

  if (!data || typeof (data as any).text !== "function") return null;
  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as VehicleSnapshot;
}

async function readCurrentLimits(sbAdmin: any) {
  await ensureBucket(sbAdmin);
  const { data, error } = await sbAdmin.storage.from(BUCKET).download(LIMITS_PATH);
  if (error) {
    if (/not found|404/i.test(error.message)) return null;
    throw new Error(error.message);
  }

  if (!data || typeof (data as any).text !== "function") return null;
  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as VehicleLimitsSnapshot;
}

async function getCurrentObjectNames(sbAdmin: any) {
  await ensureBucket(sbAdmin);
  const { data, error } = await sbAdmin.storage.from(BUCKET).list("current");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((item: any) => String(item.name ?? "")));
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const includeSnapshot = req.nextUrl.searchParams.get("includeSnapshot") === "1";
    const includeLimits = req.nextUrl.searchParams.get("includeLimits") === "1";
    const includeReportBase = req.nextUrl.searchParams.get("includeReportBase") === "1";
    const names = await getCurrentObjectNames(guard.sbAdmin);
    let snapshotUrl: string | null = null;
    let limitsUrl: string | null = null;
    let snapshot: VehicleSnapshot | null = null;
    let limits: VehicleLimitsSnapshot | null = null;
    let reportBaseRows: CargoRow[] = [];

    if (names.has("latest.json")) {
      if (includeSnapshot) {
        snapshot = await readCurrentSnapshot(guard.sbAdmin);
      } else {
        const signed = await guard.sbAdmin.storage.from(BUCKET).createSignedUrl(CURRENT_PATH, 60);
        if (signed.error) throw new Error(signed.error.message);
        snapshotUrl = signed.data.signedUrl;
      }
    }

    if (names.has("limits.json")) {
      if (includeLimits) {
        limits = await readCurrentLimits(guard.sbAdmin);
      } else {
        const signed = await guard.sbAdmin.storage.from(BUCKET).createSignedUrl(LIMITS_PATH, 60);
        if (signed.error) throw new Error(signed.error.message);
        limitsUrl = signed.data.signedUrl;
      }
    }

    if (includeSnapshot && snapshot?.cargoRows) {
      // store_map에 없는 점포를 cargoRows에서 제거 (점포마스터 갱신 반영)
      const { data: storeMapCodes } = await guard.sbAdmin
        .from("store_map")
        .select("store_code");
      const validCodes = new Set(
        (storeMapCodes ?? []).map((r: any) => normalizeStoreCode(toText(r.store_code))).filter(Boolean)
      );
      snapshot.cargoRows = snapshot.cargoRows.filter(
        (row) => !row.store_code || validCodes.has(normalizeStoreCode(toText(row.store_code)))
      );
    }

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
    }

    return json(true, undefined, { snapshotUrl, limitsUrl, snapshot, limits, reportBaseRows });
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
      limits?: VehicleLimitsSnapshot | null;
    };

    await ensureBucket(guard.sbAdmin);

    if (body.snapshot) {
      const snapshotBlob = new Blob([JSON.stringify(body.snapshot)], { type: "application/json" });
      const { error } = await guard.sbAdmin.storage.from(BUCKET).upload(CURRENT_PATH, snapshotBlob, {
        upsert: true,
        contentType: "application/json",
      });
      if (error) throw new Error(error.message);

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
    }

    if (body.limits) {
      const limitsBlob = new Blob([JSON.stringify(body.limits)], { type: "application/json" });
      const { error } = await guard.sbAdmin.storage.from(BUCKET).upload(LIMITS_PATH, limitsBlob, {
        upsert: true,
        contentType: "application/json",
      });
      if (error) throw new Error(error.message);
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

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json(false, "파일이 없습니다.", null, 400);
      fileName = file.name;
      buffer = await file.arrayBuffer();
    } else {
      const body = (await req.json().catch(() => null)) as { path?: string; fileName?: string } | null;
      const path = toText(body?.path);
      fileName = toText(body?.fileName);
      if (!path) return json(false, "업로드 경로가 없습니다.", null, 400);

      await ensureBucket(guard.sbAdmin);
      const { data, error } = await guard.sbAdmin.storage.from(BUCKET).download(path);
      if (error) throw new Error(error.message);
      buffer = await data.arrayBuffer();
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

    await ensureBucket(guard.sbAdmin);

    const stamp = uploadedAt.replace(/[:.]/g, "-");
    const safeName = sanitizeFileName(fileName || "vehicle.xlsx");
    const rawPath = `uploads/${stamp}-${safeName}`;
    const archivePath = `snapshots/${stamp}.json`;

    if (contentType.includes("multipart/form-data")) {
      const { error: rawUploadError } = await guard.sbAdmin.storage.from(BUCKET).upload(rawPath, new Uint8Array(buffer), {
        upsert: false,
        contentType: "application/octet-stream",
      });
      if (rawUploadError) throw new Error(rawUploadError.message);
    }

    const snapshotBlob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
    const { error: currentUploadError } = await guard.sbAdmin.storage.from(BUCKET).upload(CURRENT_PATH, snapshotBlob, {
      upsert: true,
      contentType: "application/json",
    });
    if (currentUploadError) throw new Error(currentUploadError.message);

    const { error: archiveUploadError } = await guard.sbAdmin.storage.from(BUCKET).upload(archivePath, snapshotBlob, {
      upsert: false,
      contentType: "application/json",
    });
    if (archiveUploadError && !/already exists/i.test(archiveUploadError.message)) {
      throw new Error(archiveUploadError.message);
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
    await ensureBucket(guard.sbAdmin);
    const { error } = await guard.sbAdmin.storage.from(BUCKET).remove([CURRENT_PATH]);
    if (error && !/not found|404/i.test(error.message)) throw new Error(error.message);
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
