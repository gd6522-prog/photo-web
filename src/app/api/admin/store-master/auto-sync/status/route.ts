import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: latest } = await supabase
      .from("store_master_sync_log")
      .select("id, status, requested_at, started_at, completed_at, upserted, error_text, log_tail")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      latest,
      running: latest?.status === "running",
      pending: latest?.status === "pending",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
