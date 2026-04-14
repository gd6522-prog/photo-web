import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json().catch(() => ({}));
    const targetSlot = body?.targetSlot as string | undefined;

    // 이미 pending/running 이 있으면 중복 방지
    const { data: existing } = await supabase
      .from("elogis_sync_log")
      .select("id, status")
      .in("status", ["pending", "running"])
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, alreadyQueued: true, status: existing[0].status });
    }

    const insertData: Record<string, unknown> = { status: "pending" };
    if (targetSlot) insertData.target_slots = [targetSlot];

    const { data, error } = await supabase
      .from("elogis_sync_log")
      .insert(insertData)
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, queued: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message ?? String(err) }, { status: 500 });
  }
}
