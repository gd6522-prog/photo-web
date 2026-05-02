import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";
import { buildNoticeBoardBody, isNoticeBoardKey } from "@/lib/notice-board";

export async function POST(req: NextRequest) {
  try {
    const r = await requireAdmin(req);
    if (!r.ok) return r.res;

    const body = await req.json().catch(() => null);

    const id = body?.id ? String(body.id).trim() : "";
    const title = String(body?.title ?? "").trim();
    const noticeBody = String(body?.body ?? "").trim();
    const boardKeyRaw = String(body?.board_key ?? "").trim();
    const is_pinned = !!body?.is_pinned;
    const board_key = isNoticeBoardKey(boardKeyRaw) ? boardKeyRaw : "notice";

    if (!title) return json(false, "Missing title", null, 400);
    if (!noticeBody) return json(false, "Missing body", null, 400);
    const storedBody = buildNoticeBoardBody(board_key, noticeBody);

    if (id) {
      // 수정: 메인/센터 관리자 또는 본인 작성글만 가능
      if (!r.isMainAdmin && !r.isCenterAdmin) {
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

      const { error } = await r.sbAdmin
        .from("notices")
        .update({ title, body: storedBody, is_pinned, board_key })
        .eq("id", id);

      if (error) return json(false, error.message, null, 500);
      return json(true);
    }

    // 신규 등록은 메인/센터 관리자만 (기존 정책 유지)
    if (!r.isMainAdmin && !r.isCenterAdmin) return json(false, "Forbidden (main/center admin only)", null, 403);

    const { error } = await r.sbAdmin.from("notices").insert({
      title,
      body: storedBody,
      is_pinned,
      board_key,
      created_by: r.uid,
    });

    if (error) return json(false, error.message, null, 500);
    return json(true);
  } catch (e: any) {
    return json(false, e?.message ?? String(e), null, 500);
  }
}
