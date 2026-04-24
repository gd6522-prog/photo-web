import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sbAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyAuth(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await sb.auth.getUser(token);
  return data?.user ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const key = new URL(req.url).searchParams.get("key");
    if (!key) return NextResponse.json({ ok: false, message: "key required" }, { status: 400 });

    const { data, error } = await sbAdmin()
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ ok: true, value: data?.value ?? null });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, message: (err as Error)?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { key?: string; value?: unknown };
    if (!body.key) return NextResponse.json({ ok: false, message: "key required" }, { status: 400 });

    const { error } = await sbAdmin()
      .from("app_settings")
      .upsert({ key: body.key, value: body.value, updated_at: new Date().toISOString() });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, message: (err as Error)?.message ?? String(err) }, { status: 500 });
  }
}
