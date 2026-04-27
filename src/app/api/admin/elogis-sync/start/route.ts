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

    // 슬롯별 동시 실행 허용 — 같은 슬롯 또는 전체 동기화 잡이 이미 떠있을 때만 거절
    const { data: actives } = await supabase
      .from("elogis_sync_log")
      .select("id, status, target_slots")
      .in("status", ["pending", "running"]);

    const isGlobalJob = (slots: unknown) =>
      !Array.isArray(slots) || slots.length === 0;
    const dup = (actives ?? []).find((j) => {
      if (targetSlot) {
        // 슬롯 트리거: 글로벌 잡이 떠있거나, 같은 슬롯을 포함하는 잡이 떠있으면 중복
        return isGlobalJob(j.target_slots) || (j.target_slots as string[]).includes(targetSlot);
      }
      // 전체 동기화 트리거: 어떤 잡이든 떠있으면 중복
      return true;
    });

    if (dup) {
      return NextResponse.json({ ok: true, alreadyQueued: true, status: dup.status });
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
