import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { getR2ObjectText, putR2Object, deleteR2Object } from "@/lib/r2";

export const runtime = "nodejs";

const ADHESION_PATH = "vehicle-data/current/adhesion.json";

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

async function readSnapshot() {
  const text = await getR2ObjectText(ADHESION_PATH);
  if (!text) return null;
  return JSON.parse(text) as AdhesionSnapshot;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const snapshot = await readSnapshot();
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

    await putR2Object(ADHESION_PATH, JSON.stringify(snapshot), "application/json");

    return json(true, undefined, { snapshot });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    await deleteR2Object(ADHESION_PATH);
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
