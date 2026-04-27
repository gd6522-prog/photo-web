import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { getErrorMessage } from "@/lib/supabase-compat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
    const raw = Array.isArray(body?.order) ? (body!.order as unknown[]) : null;
    if (!raw) return json(false, "order must be an array of user_id strings", null, 400);

    const seen = new Set<string>();
    const order: string[] = [];
    for (const v of raw) {
      const s = String(v ?? "").trim();
      if (!UUID.test(s) || seen.has(s)) continue;
      seen.add(s);
      order.push(s);
    }

    const del = await guard.sbAdmin.from("work_log_detail_order").delete().neq("user_id", ZERO_UUID);
    if (del.error) return json(false, del.error.message, null, 500);

    if (order.length === 0) {
      return json(true, undefined, { count: 0 });
    }

    const nowIso = new Date().toISOString();
    const rows = order.map((user_id, i) => ({ user_id, sort_key: i, updated_at: nowIso }));
    const ins = await guard.sbAdmin.from("work_log_detail_order").insert(rows);
    if (ins.error) return json(false, ins.error.message, null, 500);

    return json(true, undefined, { count: order.length });
  } catch (e: unknown) {
    console.error("[work-log/detail-order POST] failed", e);
    return json(false, getErrorMessage(e, "failed to save order"), null, 500);
  }
}
