import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const from = String(req.nextUrl.searchParams.get("from") ?? "");
  const to = String(req.nextUrl.searchParams.get("to") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return json(false, "Invalid date range", null, 400);
  }

  const [eventsRes, holidaysRes] = await Promise.all([
    guard.sbAdmin
      .from("calendar_events")
      .select("id, date, title, memo, created_by, created_at, updated_at")
      .gte("date", from)
      .lte("date", to),
    guard.sbAdmin.from("holidays").select("date, name, source").gte("date", from).lte("date", to),
  ]);

  if (eventsRes.error) return json(false, eventsRes.error.message, null, 500);
  if (holidaysRes.error) return json(false, holidaysRes.error.message, null, 500);

  return json(true, undefined, {
    events: eventsRes.data ?? [],
    holidays: holidaysRes.data ?? [],
  });
}
