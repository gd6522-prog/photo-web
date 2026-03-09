import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";
import { parseNoticeBoardBody } from "@/lib/notice-board";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
    if (!id) return json(false, "Missing id", null, 400);

    let row: NoticeRow | null = null;
    let authorName = "-";

    const { data, error } = await guard.sbAdmin
      .from("notices")
      .select("id, title, body, is_pinned, created_at, updated_at, created_by")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;

    row = (data ?? null) as NoticeRow | null;
    if (!row) return json(false, "Not found", null, 404);

    if (row.created_by) {
      const { data: profile } = await guard.sbAdmin.from("profiles").select("name").eq("id", row.created_by).maybeSingle();
      authorName = String((profile as { name?: string | null } | null)?.name ?? "").trim() || "-";
    }

    const parsed = parseNoticeBoardBody(row.body);
    return json(true, undefined, {
      item: {
        id: row.id,
        title: row.title,
        body: parsed.body,
        board_key: parsed.boardKey,
        is_pinned: !!row.is_pinned,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by ?? null,
        author_name: authorName,
      },
      canManageAll: guard.isMainAdmin,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
