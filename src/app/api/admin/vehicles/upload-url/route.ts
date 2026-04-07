import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { getUploadPresignedUrl, R2_BUCKET } from "@/lib/r2";

export const runtime = "nodejs";

const R2_PREFIX = "vehicle-data";

function sanitizeFileName(name: string) {
  return String(name ?? "vehicle.xlsx").replace(/[^\w.-]+/g, "_");
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => ({}))) as { fileName?: string };
    const safeName = sanitizeFileName(body.fileName ?? "vehicle.xlsx");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `${R2_PREFIX}/incoming/${stamp}-${safeName}`;

    const uploadUrl = await getUploadPresignedUrl(key, "application/octet-stream");

    return json(true, undefined, { bucket: R2_BUCKET, path: key, uploadUrl });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
