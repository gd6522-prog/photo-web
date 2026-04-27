import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const AGENT_ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2분 이내 heartbeat = 활성

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [{ data: latest }, { data: actives }, { data: agentStatus }] = await Promise.all([
      supabase
        .from("elogis_sync_log")
        .select("id, status, requested_at, started_at, completed_at, results, error_text, log_tail, target_slots")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("elogis_sync_log")
        .select("id, status, target_slots")
        .in("status", ["running", "pending"]),
      supabase
        .from("elogis_agent_status")
        .select("last_heartbeat_at")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    const lastHeartbeat = agentStatus?.last_heartbeat_at ?? null;
    const agentOnline = lastHeartbeat
      ? Date.now() - new Date(lastHeartbeat).getTime() < AGENT_ONLINE_THRESHOLD_MS
      : false;

    // 현재 running/pending 잡들에서 슬롯별 상태 집계 — 동시 실행 시 슬롯별 disabled 판정용
    // target_slots 가 null/빈 배열인 잡은 "전체 동기화"이므로 "*" 표기
    let hasGlobalJob = false;
    const runningSlotSet = new Set<string>();
    const pendingSlotSet = new Set<string>();
    for (const job of actives ?? []) {
      const slots: string[] = Array.isArray(job.target_slots) ? job.target_slots : [];
      const target = job.status === "running" ? runningSlotSet : pendingSlotSet;
      if (slots.length === 0) hasGlobalJob = true;
      else for (const s of slots) target.add(s);
    }

    return NextResponse.json({
      ok: true,
      latest,
      // 하위호환: 어딘가에 잡이 하나라도 있으면 true
      running: (actives ?? []).some((j) => j.status === "running"),
      pending: (actives ?? []).some((j) => j.status === "pending"),
      agentOnline,
      lastHeartbeat,
      // 새 필드 — UI 가 슬롯별 disabled 판정에 사용
      hasGlobalJob,
      runningSlots: Array.from(runningSlotSet),
      pendingSlots: Array.from(pendingSlotSet),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message ?? String(err) }, { status: 500 });
  }
}
