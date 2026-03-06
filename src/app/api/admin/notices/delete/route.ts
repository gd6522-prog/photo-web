import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";

export async function POST(req: NextRequest) {
  try {
    const r = await requireAdmin(req);
    if (!r.ok) return r.res;

    if (!r.isMainAdmin) return json(false, "Forbidden (main admin only)", null, 403);

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "").trim();
    if (!id) return json(false, "Missing id", null, 400);

    const { error } = await r.sbAdmin.from("notices").delete().eq("id", id);
    if (error) return json(false, error.message, null, 500);

    return json(true);
  } catch (e: any) {
    return json(false, e?.message ?? String(e), null, 500);
  }
}