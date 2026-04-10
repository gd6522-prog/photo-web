import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";
import { parseNoticeBoardBody } from "@/lib/notice-board";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  board_key: string;
  is_pinned: boolean | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  view_count: number;
};

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
    if (!id) return json(false, "Missing id", null, 400);

    const { data, error } = await guard.sbAdmin
      .from("notices")
      .select("id, title, body, board_key, is_pinned, created_at, updated_at, created_by, view_count")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;

    const row = (data ?? null) as NoticeRow | null;
    if (!row) return json(false, "Not found", null, 404);

    const newViewCount = (row.view_count ?? 0) + 1;

    // view_count 증가 + 작성자 이름 조회 병렬 처리, view_count는 응답 안 기다림
    const [profileResult] = await Promise.all([
      row.created_by
        ? guard.sbAdmin.from("profiles").select("name").eq("id", row.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
      guard.sbAdmin.from("notices").update({ view_count: newViewCount }).eq("id", id),
    ]);

    const authorName = String((profileResult.data as { name?: string | null } | null)?.name ?? "").trim() || "-";
    const parsed = parseNoticeBoardBody(row.body);

    return json(true, undefined, {
      item: {
        id: row.id,
        title: row.title,
        body: parsed.body,
        board_key: row.board_key ?? parsed.boardKey,
        is_pinned: !!row.is_pinned,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by ?? null,
        author_name: authorName,
        view_count: newViewCount,
      },
      canManageAll: guard.isMainAdmin,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
