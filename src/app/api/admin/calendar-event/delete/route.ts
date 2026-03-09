import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "").trim();
    if (!id) return json(false, "Missing id", null, 400);

    const { error } = await guard.sbAdmin.from("calendar_events").delete().eq("id", id);
    if (error) return json(false, error.message, null, 500);

    return json(true);
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
