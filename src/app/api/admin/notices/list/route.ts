// src/app/api/admin/notices/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function bearerToken(req: Request) {
  const v = req.headers.get("authorization") || "";
  const m = v.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? "";
}

export async function GET(req: Request) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, message: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 세션 체크
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const user = userData.user;
    if (!user) return NextResponse.json({ ok: false, message: "Invalid session" }, { status: 401 });

    // 관리자 체크
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, is_admin, work_part")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) throw profErr;

    const hardAdmin = user.id === "bf70f0c0-3c58-444e-b69f-bd5de601deb6" || (user.email ?? "") === "gd6522@naver.com";
    const isAdmin =
      hardAdmin || !!(prof as any)?.is_admin || String((prof as any)?.work_part ?? "").trim() === "관리자";

    if (!isAdmin) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

    // ✅ 1) created_by 포함해서 먼저 시도
    let rows: any[] = [];
    let hasCreatedBy = true;

    {
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, body, is_pinned, updated_at, created_by")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) {
        // created_by 컬럼이 없으면 여기로 떨어짐
        hasCreatedBy = false;

        const r2 = await supabase
          .from("notices")
          .select("id, title, body, is_pinned, updated_at")
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false });

        if (r2.error) throw r2.error;
        rows = (r2.data ?? []) as any[];
      } else {
        rows = (data ?? []) as any[];
      }
    }

    // ✅ 2) 작성자 uid들 → profiles.name 매핑
    let nameMap: Record<string, string> = {};
    if (hasCreatedBy) {
      const ids = Array.from(
        new Set(
          rows
            .map((r) => r?.created_by)
            .filter((v) => typeof v === "string" && v.length > 0)
        )
      ) as string[];

      if (ids.length > 0) {
        const { data: profs, error: pErr } = await supabase.from("profiles").select("id, name").in("id", ids);
        if (pErr) throw pErr;

        nameMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, String(p.name ?? "").trim() || "-"]));
      }
    }

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      is_pinned: !!r.is_pinned,
      updated_at: r.updated_at,
      author_name: hasCreatedBy && r.created_by ? nameMap[r.created_by] ?? "-" : "-",
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? String(e) }, { status: 500 });
  }
}