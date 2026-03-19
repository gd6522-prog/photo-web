import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";
import { isNoticeBoardKey, makeNoticeExcerpt, parseNoticeBoardBody } from "@/lib/notice-board";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
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
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 0;

    let rows: NoticeRow[] = [];
    let hasCreatedBy = true;

    {
      let query = guard.sbAdmin
        .from("notices")
        .select("id, title, body, is_pinned, created_at, updated_at, created_by")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (limit > 0 && !q) query = query.limit(limit);
      const { data, error } = await query;

      if (error) {
        hasCreatedBy = false;

        let fallbackQuery = guard.sbAdmin
          .from("notices")
          .select("id, title, body, is_pinned, created_at, updated_at")
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false });
        if (limit > 0 && !q) fallbackQuery = fallbackQuery.limit(limit);
        const r2 = await fallbackQuery;

        if (r2.error) throw r2.error;
        rows = (r2.data ?? []) as NoticeRow[];
      } else {
        rows = (data ?? []) as NoticeRow[];
      }
    }

    let nameMap: Record<string, string> = {};
    if (hasCreatedBy) {
      const ids = Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => typeof v === "string" && v.length > 0)));

      if (ids.length > 0) {
        const { data: profs, error: pErr } = await guard.sbAdmin.from("profiles").select("id, name").in("id", ids);
        if (pErr) throw pErr;

        nameMap = Object.fromEntries(((profs ?? []) as ProfileNameRow[]).map((p) => [p.id, String(p.name ?? "").trim() || "-"]));
      }
    }

    const items = rows
      .map((r) => {
        const parsed = parseNoticeBoardBody(r.body);
        return {
          id: r.id,
          title: r.title,
          body: parsed.body,
          board_key: parsed.boardKey,
          excerpt: makeNoticeExcerpt(parsed.body),
          is_pinned: !!r.is_pinned,
          created_at: r.created_at,
          updated_at: r.updated_at,
          created_by: hasCreatedBy ? r.created_by ?? null : null,
          author_name: hasCreatedBy && r.created_by ? nameMap[r.created_by] ?? "-" : "-",
        };
      })
      .filter((item) => {
        if (isNoticeBoardKey(board) && item.board_key !== board) return false;
        if (!q) return true;
        return [item.title, item.body, item.author_name ?? ""].some((value) => String(value).toLowerCase().includes(q));
      });

    return json(true, undefined, { items, canManageAll: guard.isMainAdmin });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
