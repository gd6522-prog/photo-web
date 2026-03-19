import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

const BUCKET = "vehicle-data";

function sanitizeFileName(name: string) {
  return String(name ?? "vehicle.xlsx").replace(/[^\w.-]+/g, "_");
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

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => ({}))) as { fileName?: string };
    const safeName = sanitizeFileName(body.fileName ?? "vehicle.xlsx");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `incoming/${stamp}-${safeName}`;

    await ensureBucket(guard.sbAdmin);
    const { data, error } = await guard.sbAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);

    return json(true, undefined, { bucket: BUCKET, path, token: data.token });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
