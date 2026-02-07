import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("ENV 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const sb = supabaseAdmin();
    const payload = await req.json().catch(() => ({} as any));

    const id = payload.id ? String(payload.id) : null;
    const title = String(payload.title ?? "").trim();
    const body = String(payload.body ?? "").trim();
    const is_pinned = Boolean(payload.is_pinned);

    if (!title) return NextResponse.json({ ok: false, message: "제목이 비었습니다." }, { status: 400 });
    if (!body) return NextResponse.json({ ok: false, message: "내용이 비었습니다." }, { status: 400 });

    // ✅ 신규
    if (!id) {
      const { data, error } = await sb
        .from("notices")
        .insert({
          title,
          body,
          is_pinned,
          updated_at: new Date().toISOString(),
        })
        .select("id,title,body,is_pinned,updated_at")
        .single();

      if (error) throw error;

      return NextResponse.json({ ok: true, item: data });
    }

    // ✅ 수정
    const { data, error } = await sb
      .from("notices")
      .update({
        title,
        body,
        is_pinned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,title,body,is_pinned,updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    // ✅ 여기서도 무조건 JSON 내려줌 (프론트가 res.json() 하다가 안죽게)
    return NextResponse.json(
      { ok: false, message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
