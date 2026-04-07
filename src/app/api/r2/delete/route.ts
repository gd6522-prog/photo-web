import { NextRequest } from "next/server";
import { deleteR2Object, deleteR2Objects } from "@/lib/r2";
import { requireAdmin, json } from "../../admin/notices/_shared";

export const runtime = "nodejs";

const ALLOWED_PREFIXES = ["photos/", "delivery_photos/", "hazard-reports/", "vehicle-data/"];

function isValidKey(key: string) {
  return key.trim() !== "" && ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string; keys?: string[] };

    // 배치 삭제
    if (body.keys) {
      const keys = body.keys.filter(isValidKey);
      if (keys.length === 0) return json(false, "No valid keys", null, 400);
      await deleteR2Objects(keys);
      return json(true, undefined, { deleted: keys.length });
    }

    // 단일 삭제
    const key = String(body.key ?? "").trim();
    if (!isValidKey(key)) return json(false, "Invalid key", null, 400);
    await deleteR2Object(key);
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
