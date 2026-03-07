import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server env missing: MIGRATION_SECRET" }, { status: 500 });
  }
  const s = req.headers.get("x-migration-secret");
  if (!s || s !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "server env missing: supabase url/service role key" }, { status: 500 });
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, phone, name, created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missing: any[] = [];
  const ok: any[] = [];

  for (const p of profiles ?? []) {
    try {
      const { data } = await admin.auth.admin.getUserById(p.id);
      if (data?.user) ok.push(p);
      else missing.push(p);
    } catch {
      missing.push(p);
    }
  }

  return NextResponse.json({
    total: profiles?.length ?? 0,
    ok: ok.length,
    missing: missing.length,
    missing_users: missing,
  });
}
