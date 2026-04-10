import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";
import { isNoticeBoardKey } from "@/lib/notice-board";

type NoticeRow = {
  id: string;
  title: string;
  board_key: string;
  is_pinned: boolean | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  view_count?: number;
};

type ProfileNameRow = {
  id: string;
  name: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const board = String(req.nextUrl.searchParams.get("board") ?? "").trim();
    const q = String(req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "0");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

    // body 없이 board_key 컬럼으로 DB에서 직접 필터링
    let query = guard.sbAdmin
      .from("notices")
      .select("id, title, board_key, is_pinned, created_at, updated_at, created_by, view_count")
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (isNoticeBoardKey(board)) {
      query = query.eq("board_key", board);
    }

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as NoticeRow[];

    // 작성자 이름 일괄 조회
    const ids = Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => typeof v === "string" && v.length > 0)));
    let nameMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profs } = await guard.sbAdmin.from("profiles").select("id, name").in("id", ids);
      nameMap = Object.fromEntries(((profs ?? []) as ProfileNameRow[]).map((p) => [p.id, String(p.name ?? "").trim() || "-"]));
    }

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      board_key: isNoticeBoardKey(r.board_key) ? r.board_key : "notice",
      is_pinned: !!r.is_pinned,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: r.created_by ?? null,
      author_name: r.created_by ? (nameMap[r.created_by] ?? "-") : "-",
      view_count: r.view_count ?? 0,
    }));

    return json(true, undefined, { items, canManageAll: guard.isMainAdmin });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
