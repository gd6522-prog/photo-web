import { NextRequest } from "next/server";
import { json, requireAdmin } from "../_shared";

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

    let rows: NoticeRow[] = [];
    let hasCreatedBy = true;

    {
      const { data, error } = await guard.sbAdmin
        .from("notices")
        .select("id, title, body, is_pinned, created_at, updated_at, created_by")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) {
        hasCreatedBy = false;

        const r2 = await guard.sbAdmin
          .from("notices")
          .select("id, title, body, is_pinned, created_at, updated_at")
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false });

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

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      is_pinned: !!r.is_pinned,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: hasCreatedBy ? r.created_by ?? null : null,
      author_name: hasCreatedBy && r.created_by ? nameMap[r.created_by] ?? "-" : "-",
    }));

    return json(true, undefined, { items, canManageAll: guard.isMainAdmin });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
