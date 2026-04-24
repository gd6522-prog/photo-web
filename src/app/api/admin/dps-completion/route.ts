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

    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "60");

    const { data, error } = await sbAdmin()
      .from("dps_daily_completion")
      .select("work_date, completed_at, snapshot, created_at")
      .order("work_date", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, message: (err as Error)?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as {
      work_date?: string;
      completed_at?: string | null;
      snapshot?: unknown;
    };
    if (!body.work_date) return NextResponse.json({ ok: false, message: "work_date required" }, { status: 400 });

    const { error } = await sbAdmin()
      .from("dps_daily_completion")
      .upsert(
        {
          work_date: body.work_date,
          completed_at: body.completed_at ?? null,
          snapshot: body.snapshot ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "work_date", ignoreDuplicates: false }
      );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, message: (err as Error)?.message ?? String(err) }, { status: 500 });
  }
}
