import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { encodeCalendarEventMemo, type CalendarEventType } from "@/lib/calendar-event-type";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "").trim();
    const date = String(body?.date ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const memo = String(body?.memo ?? "").trim();
    const eventType = String(body?.event_type ?? "").trim() as CalendarEventType;
    const encodedMemo = encodeCalendarEventMemo(eventType, memo);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(false, "Invalid date", null, 400);
    if (!title) return json(false, "Missing title", null, 400);

    if (id) {
      const { error } = await guard.sbAdmin
        .from("calendar_events")
        .update({ date, title, memo: encodedMemo })
        .eq("id", id);

      if (error) return json(false, error.message, null, 500);
      return json(true);
    }

    const { error } = await guard.sbAdmin.from("calendar_events").insert({
      date,
      title,
      memo: encodedMemo,
      created_by: guard.uid,
    });

    if (error) return json(false, error.message, null, 500);
    return json(true);
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
