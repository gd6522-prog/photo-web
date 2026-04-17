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

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const day = (req.nextUrl.searchParams.get("day") ?? "").trim();
  if (!day) return json(false, "day is required", null, 400);

  try {
    const scope = await getWorkLogScope(guard.sbAdmin, guard.uid);
    const profiles = await getWorkLogProfiles(guard.sbAdmin, scope, {
      nameQ: req.nextUrl.searchParams.get("nameQ") ?? "",
      company: req.nextUrl.searchParams.get("company") ?? "",
      workPart: req.nextUrl.searchParams.get("workPart") ?? "",
      workTable: req.nextUrl.searchParams.get("workTable") ?? "",
      includeResigned: req.nextUrl.searchParams.get("includeResigned") === "1",
    });

    const ids = profiles.map((p) => p.id);
    let shifts: ShiftRow[] = [];
    if (ids.length > 0) {
      const { data: sData, error: sErr } = await guard.sbAdmin
        .from("work_shifts")
        .select("id,user_id,work_date,clock_in_at,clock_out_at,clock_in_lat,clock_in_lng,clock_out_lat,clock_out_lng,created_at")
        .eq("work_date", day)
        .in("user_id", ids)
        .order("created_at", { ascending: false });
      if (sErr) return json(false, sErr.message, null, 500);
      shifts = (sData ?? []) as ShiftRow[];
    }

    return json(true, undefined, { isCompanyAdminRole: scope.isCompanyAdminRole, profiles, shifts });
  } catch (e: unknown) {
    console.error("[work-log/basic] failed", e);
    return json(false, getErrorMessage(e, "failed to load basic work-log"), null, 500);
  }
}

