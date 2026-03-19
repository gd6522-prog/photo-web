import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

const BUCKET = "vehicle-data";
const ADHESION_PATH = "current/adhesion.json";

type AdhesionDriverStat = {
  name: string;
  adhesionRate: string;
  cumulativeRate: string;
};

type AdhesionStoreStat = {
  storeName: string;
  postGrade: string;
  category: string;
};

type AdhesionSnapshot = {
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  driverStats: AdhesionDriverStat[];
  storeStats: AdhesionStoreStat[];
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

async function readSnapshot(sbAdmin: any) {
  await ensureBucket(sbAdmin);
  const { data, error } = await sbAdmin.storage.from(BUCKET).download(ADHESION_PATH);
  if (error) {
    if (/not found|404/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data || typeof (data as any).text !== "function") return null;
  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as AdhesionSnapshot;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const snapshot = await readSnapshot(guard.sbAdmin);
    return json(true, undefined, { snapshot });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => null)) as Partial<AdhesionSnapshot> | null;
    if (!body) return json(false, "점착 데이터를 읽지 못했습니다.", null, 400);

    const driverStats = Array.isArray(body.driverStats)
      ? body.driverStats.map((row) => ({
          name: String(row.name ?? "").trim(),
          adhesionRate: String(row.adhesionRate ?? "").trim(),
          cumulativeRate: String(row.cumulativeRate ?? "").trim(),
        })).filter((row) => row.name)
      : [];

    const storeStats = Array.isArray(body.storeStats)
      ? body.storeStats.map((row) => ({
          storeName: String(row.storeName ?? "").trim(),
          postGrade: String(row.postGrade ?? "").trim(),
          category: String(row.category ?? "").trim(),
        })).filter((row) => row.storeName)
      : [];

    const snapshot: AdhesionSnapshot = {
      fileName: String(body.fileName ?? "").trim() || "점착.xlsx",
      uploadedAt: new Date().toISOString(),
      uploadedBy: guard.email,
      driverStats,
      storeStats,
    };

    await ensureBucket(guard.sbAdmin);
    const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
    const { error } = await guard.sbAdmin.storage.from(BUCKET).upload(ADHESION_PATH, blob, {
      upsert: true,
      contentType: "application/json",
    });
    if (error) throw new Error(error.message);

    return json(true, undefined, { snapshot });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    await ensureBucket(guard.sbAdmin);
    const { error } = await guard.sbAdmin.storage.from(BUCKET).remove([ADHESION_PATH]);
    if (error && !/not found|404/i.test(error.message)) {
      throw new Error(error.message);
    }
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
