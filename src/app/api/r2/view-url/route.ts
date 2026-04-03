import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../admin/notices/_shared";
import { getViewPresignedUrl } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string };
    if (!body.key) return json(false, "key required", null, 400);

    const url = await getViewPresignedUrl(body.key);
    return json(true, undefined, { url });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
