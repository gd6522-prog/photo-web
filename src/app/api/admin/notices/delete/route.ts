import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";

export async function POST(req: NextRequest) {
  try {
    const r = await requireAdmin(req);
    if (!r.ok) return r.res;

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "").trim();
    if (!id) return json(false, "Missing id", null, 400);

    // 본인 작성글이거나 메인 관리자만 삭제 가능
    if (!r.isMainAdmin) {
      const { data: post, error: fetchErr } = await r.sbAdmin
        .from("notices")
        .select("created_by")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) return json(false, fetchErr.message, null, 500);
      if (!post) return json(false, "Not found", null, 404);
      const isOwnAuthor = !!(post as { created_by?: string }).created_by && (post as { created_by?: string }).created_by === r.uid;
      if (!isOwnAuthor) return json(false, "Forbidden", null, 403);
    }

    const { error } = await r.sbAdmin.from("notices").delete().eq("id", id);
    if (error) return json(false, error.message, null, 500);

    return json(true);
  } catch (e: any) {
    return json(false, e?.message ?? String(e), null, 500);
  }
}