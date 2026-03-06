import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";

export async function POST(req: NextRequest) {
  try {
    const r = await requireAdmin(req);
    if (!r.ok) return r.res;

    if (!r.isMainAdmin) return json(false, "Forbidden (main admin only)", null, 403);

    const body = await req.json().catch(() => null);

    const id = body?.id ? String(body.id).trim() : "";
    const title = String(body?.title ?? "").trim();
    const noticeBody = String(body?.body ?? "").trim();
    const is_pinned = !!body?.is_pinned;

    if (!title) return json(false, "Missing title", null, 400);
    if (!noticeBody) return json(false, "Missing body", null, 400);

    if (id) {
      const { error } = await r.sbAdmin
        .from("notices")
        .update({ title, body: noticeBody, is_pinned })
        .eq("id", id);

      if (error) return json(false, error.message, null, 500);
      return json(true);
    }

    const { error } = await r.sbAdmin.from("notices").insert({
      title,
      body: noticeBody,
      is_pinned,
    });

    if (error) return json(false, error.message, null, 500);
    return json(true);
  } catch (e: any) {
    return json(false, e?.message ?? String(e), null, 500);
  }
}