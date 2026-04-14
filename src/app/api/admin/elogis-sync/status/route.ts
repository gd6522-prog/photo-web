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

    const [{ data: latest }, { data: agentStatus }] = await Promise.all([
      supabase
        .from("elogis_sync_log")
        .select("id, status, requested_at, started_at, completed_at, results, error_text, log_tail")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
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

    return NextResponse.json({
      ok: true,
      latest,
      running: latest?.status === "running",
      pending: latest?.status === "pending",
      agentOnline,
      lastHeartbeat,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message ?? String(err) }, { status: 500 });
  }
}
