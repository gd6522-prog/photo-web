import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

const BUCKET = "vehicle-data";
const CDC_PATH = "current/cdc.json";

type CdcRow = {
  carNo: string;
  storeCode: string;
  storeName: string;
  maxBoxNo: number;
};

type FullBoxRow = {
  storeCode: string;
  storeName: string;
  maxBoxNo: number;
};

type CdcSnapshot = {
  fileName: string;
  fullBoxFileName: string;
  deliveryDate: string;
  uploadedAt: string;
  uploadedBy: string;
  rows: CdcRow[];
  fullBoxRows: FullBoxRow[];
};

type StoreMapRow = {
  storeCode: string;
  storeName: string;
  carNo: string;
  seqNo: number;
};

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

async function writeSnapshot(sbAdmin: any, snapshot: CdcSnapshot) {
  await ensureBucket(sbAdmin);
  const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
  const { error } = await sbAdmin.storage.from(BUCKET).upload(CDC_PATH, blob, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) throw new Error(error.message);
}

async function readSnapshot(sbAdmin: any) {
  await ensureBucket(sbAdmin);
  const { data, error } = await sbAdmin.storage.from(BUCKET).download(CDC_PATH);
  if (error) {
    if (/not found|404/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data || typeof (data as Blob).text !== "function") return null;

  const text = await data.text();
  if (!text) return null;

  const parsed = JSON.parse(text) as Partial<CdcSnapshot> | null;
  if (!parsed) return null;

  const rows = Array.isArray(parsed.rows)
    ? parsed.rows
        .map((row) => ({
          carNo: String((row as CdcRow).carNo ?? "").trim(),
          storeCode: String((row as CdcRow).storeCode ?? "").trim(),
          storeName: String((row as CdcRow).storeName ?? "").trim(),
          maxBoxNo: Number((row as CdcRow).maxBoxNo ?? 0) || 0,
        }))
        .filter((row) => row.carNo || row.storeCode || row.storeName)
    : [];

  const fullBoxRows = Array.isArray(parsed.fullBoxRows)
    ? parsed.fullBoxRows
        .map((row) => ({
          storeCode: String((row as FullBoxRow).storeCode ?? "").trim(),
          storeName: String((row as FullBoxRow).storeName ?? "").trim(),
          maxBoxNo: Number((row as FullBoxRow).maxBoxNo ?? 0) || 0,
        }))
        .filter((row) => row.storeCode || row.storeName)
    : [];

  return {
    fileName: String(parsed.fileName ?? "").trim(),
    fullBoxFileName: String(parsed.fullBoxFileName ?? "").trim(),
    deliveryDate: String(parsed.deliveryDate ?? "").trim(),
    uploadedAt: String(parsed.uploadedAt ?? "").trim(),
    uploadedBy: String(parsed.uploadedBy ?? "").trim(),
    rows,
    fullBoxRows,
  } satisfies CdcSnapshot;
}

function normalizeStoreName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeStoreCode(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

async function fetchStoreMapRowsForSnapshot(sbAdmin: any, snapshot: CdcSnapshot | null) {
  if (!snapshot) return [] as StoreMapRow[];

  // 점포명 기준 중복 시 store_code 높은 것만 유지
  const byName = new Map<string, StoreMapRow>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await sbAdmin
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no")
      .not("car_no", "is", null)
      .neq("car_no", "")
      .range(from, to);
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as any[]) {
      const nameKey = normalizeStoreName(row.store_name);
      if (!nameKey) continue;
      const payload: StoreMapRow = {
        storeCode: String(row.store_code ?? "").trim(),
        storeName: String(row.store_name ?? "").trim(),
        carNo: String(row.car_no ?? "").trim(),
        seqNo: Number(row.seq_no ?? 0) || 0,
      };
      const existing = byName.get(nameKey);
      if (!existing) {
        byName.set(nameKey, payload);
      } else {
        const existingNum = parseInt(normalizeStoreCode(existing.storeCode), 10) || 0;
        const newNum = parseInt(normalizeStoreCode(payload.storeCode), 10) || 0;
        if (newNum > existingNum) byName.set(nameKey, payload);
      }
    }

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return [...byName.values()].sort((a, b) => {
    const carDiff = a.carNo.localeCompare(b.carNo, "ko", { numeric: true });
    if (carDiff !== 0) return carDiff;
    const seqDiff = a.seqNo - b.seqNo;
    if (seqDiff !== 0) return seqDiff;
    return a.storeName.localeCompare(b.storeName, "ko");
  });
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const snapshot = await readSnapshot(guard.sbAdmin);
    const storeMapRows = await fetchStoreMapRowsForSnapshot(guard.sbAdmin, snapshot);
    return json(true, undefined, { snapshot, storeMapRows });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => null)) as Partial<CdcSnapshot> | null;
    if (!body) return json(false, "요청 데이터를 읽지 못했습니다.", null, 400);

    const rows = Array.isArray(body.rows)
      ? body.rows
          .map((row) => ({
            carNo: String((row as CdcRow).carNo ?? "").trim(),
            storeCode: String((row as CdcRow).storeCode ?? "").trim(),
            storeName: String((row as CdcRow).storeName ?? "").trim(),
            maxBoxNo: Number((row as CdcRow).maxBoxNo ?? 0) || 0,
          }))
          .filter((row) => row.storeCode && row.storeName)
      : [];

    const fullBoxRows = Array.isArray(body.fullBoxRows)
      ? body.fullBoxRows
          .map((row) => ({
            storeCode: String((row as FullBoxRow).storeCode ?? "").trim(),
            storeName: String((row as FullBoxRow).storeName ?? "").trim(),
            maxBoxNo: Number((row as FullBoxRow).maxBoxNo ?? 0) || 0,
          }))
          .filter((row) => row.storeCode || row.storeName)
      : [];

    const snapshot: CdcSnapshot = {
      fileName: String(body.fileName ?? "").trim(),
      fullBoxFileName: String(body.fullBoxFileName ?? "").trim(),
      deliveryDate: String(body.deliveryDate ?? "").trim(),
      uploadedAt: new Date().toISOString(),
      uploadedBy: guard.email,
      rows,
      fullBoxRows,
    };

    await writeSnapshot(guard.sbAdmin, snapshot);
    return json(true, undefined, { snapshot });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const snapshot: CdcSnapshot = {
      fileName: "",
      fullBoxFileName: "",
      deliveryDate: "",
      uploadedAt: new Date().toISOString(),
      uploadedBy: guard.email,
      rows: [],
      fullBoxRows: [],
    };

    await writeSnapshot(guard.sbAdmin, snapshot);
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
