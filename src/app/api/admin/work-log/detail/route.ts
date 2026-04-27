import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { getWorkLogProfiles, getWorkLogScope } from "../_shared";
import { getErrorMessage } from "@/lib/supabase-compat";

type ShiftRow = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  created_at: string;
};

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const month = (req.nextUrl.searchParams.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return json(false, "month is required (YYYY-MM)", null, 400);

  try {
    const scope = await getWorkLogScope(guard.sbAdmin, guard.uid);
    const profiles = await getWorkLogProfiles(guard.sbAdmin, scope, {
      nameQ: req.nextUrl.searchParams.get("nameQ") ?? "",
      company: req.nextUrl.searchParams.get("company") ?? "",
      workPart: req.nextUrl.searchParams.get("workPart") ?? "",
      workTable: req.nextUrl.searchParams.get("workTable") ?? "",
      includeResigned: req.nextUrl.searchParams.get("includeResigned") === "1",
      excludeTemporary: true,
    });

    const ids = profiles.map((p) => p.id);
    if (ids.length === 0) {
      const orderRes = await guard.sbAdmin.from("work_log_detail_order").select("user_id").order("sort_key", { ascending: true });
      const customOrder = ((orderRes.data ?? []) as Array<{ user_id: string }>).map((x) => x.user_id);
      return json(true, undefined, { isCompanyAdminRole: scope.isCompanyAdminRole, isMainAdmin: guard.isMainAdmin, profiles: [], monthShifts: [], holidayDates: [], customOrder });
    }

    const r = monthRange(month);
    const [ss, hs, oo] = await Promise.all([
      guard.sbAdmin
        .from("work_shifts")
        .select("id,user_id,work_date,clock_in_at,clock_out_at,clock_in_lat,clock_in_lng,clock_out_lat,clock_out_lng,created_at")
        .gte("work_date", r.from)
        .lte("work_date", r.to)
        .in("user_id", ids)
        .order("created_at", { ascending: false }),
      guard.sbAdmin.from("holidays").select("date").gte("date", r.from).lte("date", r.to),
      guard.sbAdmin.from("work_log_detail_order").select("user_id").order("sort_key", { ascending: true }),
    ]);

    if (ss.error) return json(false, ss.error.message, null, 500);
    if (hs.error) return json(false, hs.error.message, null, 500);
    if (oo.error) return json(false, oo.error.message, null, 500);

    const holidayDates = ((hs.data ?? []) as Array<{ date?: string | null }>).map((x) => x.date).filter((v): v is string => !!v);
    const customOrder = ((oo.data ?? []) as Array<{ user_id: string }>).map((x) => x.user_id);
    return json(true, undefined, {
      isCompanyAdminRole: scope.isCompanyAdminRole,
      isMainAdmin: guard.isMainAdmin,
      profiles,
      monthShifts: (ss.data ?? []) as ShiftRow[],
      holidayDates,
      customOrder,
    });
  } catch (e: unknown) {
    console.error("[work-log/detail] failed", e);
    return json(false, getErrorMessage(e, "failed to load detail work-log"), null, 500);
  }
}

