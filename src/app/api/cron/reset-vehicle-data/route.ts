import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "vehicle-data";
const PATHS = [
  "current/cdc.json",
  "current/adhesion.json",
  "current/latest.json",
];

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, message: "Missing Supabase env" }, { status: 500 });
  }

  const sbAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const { error } = await sbAdmin.storage.from(BUCKET).remove(PATHS);
    if (error && !/not found|404/i.test(error.message)) {
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, message: "차량 데이터 초기화 완료", cleared: PATHS });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
