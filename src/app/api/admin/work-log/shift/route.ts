import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { getErrorMessage } from "@/lib/supabase-compat";

const HHMM = /^\d{1,2}:\d{2}(:\d{2})?$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toKstIso(workDate: string, hhmm: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = m[2];
  const ss = m[3] ?? "00";
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  const d = new Date(`${workDate}T${hh}:${mm}:${ss}+09:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function parseTime(workDate: string, raw: unknown): { ok: true; iso: string | null } | { ok: false; msg: string } {
  if (raw === null) return { ok: true, iso: null };
  if (typeof raw !== "string") return { ok: false, msg: "invalid time value" };
  const t = raw.trim();
  if (!t) return { ok: true, iso: null };
  if (HHMM.test(t)) {
    const iso = toKstIso(workDate, t);
    if (!iso) return { ok: false, msg: "invalid HH:MM" };
    return { ok: true, iso };
  }
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return { ok: false, msg: "invalid datetime" };
  return { ok: true, iso: d.toISOString() };
}

export async function PATCH(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;
    if (!guard.isMainAdmin) return json(false, "Forbidden (main admin only)", null, 403);

    const body = (await req.json().catch(() => null)) as {
      user_id?: string;
      work_date?: string;
      clock_in_at?: string | null;
      clock_out_at?: string | null;
    } | null;

    const userId = String(body?.user_id ?? "").trim();
    const workDate = String(body?.work_date ?? "").trim();
    if (!UUID.test(userId)) return json(false, "invalid user_id", null, 400);
    if (!YMD.test(workDate)) return json(false, "invalid work_date (YYYY-MM-DD)", null, 400);

    const hasIn = Object.prototype.hasOwnProperty.call(body ?? {}, "clock_in_at");
    const hasOut = Object.prototype.hasOwnProperty.call(body ?? {}, "clock_out_at");
    if (!hasIn && !hasOut) return json(false, "no fields to update", null, 400);

    const patch: { clock_in_at?: string | null; clock_out_at?: string | null } = {};
    if (hasIn) {
      const r = parseTime(workDate, body?.clock_in_at ?? null);
      if (!r.ok) return json(false, `clock_in_at: ${r.msg}`, null, 400);
      patch.clock_in_at = r.iso;
    }
    if (hasOut) {
      const r = parseTime(workDate, body?.clock_out_at ?? null);
      if (!r.ok) return json(false, `clock_out_at: ${r.msg}`, null, 400);
      patch.clock_out_at = r.iso;
    }

    const existing = await guard.sbAdmin
      .from("work_shifts")
      .select("id,user_id,work_date,clock_in_at,clock_out_at")
      .eq("user_id", userId)
      .eq("work_date", workDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) return json(false, existing.error.message, null, 500);

    if (existing.data) {
      const upd = await guard.sbAdmin
        .from("work_shifts")
        .update(patch)
        .eq("id", (existing.data as { id: string }).id)
        .select("id,user_id,work_date,clock_in_at,clock_out_at")
        .maybeSingle();
      if (upd.error) return json(false, upd.error.message, null, 500);
      return json(true, undefined, { shift: upd.data });
    }

    const insertRow: Record<string, unknown> = {
      user_id: userId,
      work_date: workDate,
      clock_in_at: patch.clock_in_at ?? null,
      clock_out_at: patch.clock_out_at ?? null,
    };
    const ins = await guard.sbAdmin
      .from("work_shifts")
      .insert(insertRow)
      .select("id,user_id,work_date,clock_in_at,clock_out_at")
      .maybeSingle();
    if (ins.error) return json(false, ins.error.message, null, 500);
    return json(true, undefined, { shift: ins.data });
  } catch (e: unknown) {
    console.error("[work-log/shift PATCH] failed", e);
    return json(false, getErrorMessage(e, "failed to update shift"), null, 500);
  }
}
