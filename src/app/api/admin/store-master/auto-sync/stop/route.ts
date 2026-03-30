import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase
      .from("store_master_sync_log")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .in("status", ["pending", "running"]);

    return NextResponse.json({ ok: true, stopped: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
