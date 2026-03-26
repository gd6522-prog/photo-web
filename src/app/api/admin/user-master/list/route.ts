import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { isCompanyAdminFlag, isCompanyAdminWorkPart } from "@/lib/admin-role";
import { isMissingColumnError } from "@/lib/supabase-compat";

const BLOCKED_COMPANY = "\uD55C\uC775\uC2A4\uD504\uB808\uC2A4";

type ProfileRow = {
  id: string;
  approval_status: string | null;
  name: string | null;
  phone: string | null;
  birthdate: string | null;
  work_part: string | null;
  company_name: string | null;
  work_table: string | null;
  join_date: string | null;
  leave_date: string | null;
  is_admin?: boolean | null;
  is_general_admin?: boolean | null;
  is_company_admin?: boolean | null;
};

type ShiftTodayRow = {
  user_id: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

function kstTodayYMD(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function displayWorkPart(workPart: string | null): string | null {
  return isCompanyAdminWorkPart(workPart) ? "\uAD00\uB9AC\uC790" : workPart;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const qName = (req.nextUrl.searchParams.get("qName") ?? "").trim();
  const qPart = (req.nextUrl.searchParams.get("qPart") ?? "").trim();
  const qCompany = (req.nextUrl.searchParams.get("qCompany") ?? "").trim();
  const qWorkTable = (req.nextUrl.searchParams.get("qWorkTable") ?? "").trim();

  let myProf:
    | {
        work_part?: string | null;
        is_company_admin?: boolean | null;
      }
    | null = null;
  let meErr: unknown = null;
  {
    const result = await guard.sbAdmin.from("profiles").select("work_part,is_company_admin").eq("id", guard.uid).maybeSingle();
    myProf = result.data;
    meErr = result.error;
  }
  if (isMissingColumnError(meErr, "is_company_admin")) {
    const retry = await guard.sbAdmin.from("profiles").select("work_part").eq("id", guard.uid).maybeSingle();
    myProf = retry.data;
    meErr = retry.error;
  }
  if (meErr) {
    const message = meErr instanceof Error ? meErr.message : String(meErr);
    return json(false, message, null, 500);
  }

  const isCompanyAdminRole =
    isCompanyAdminFlag(myProf?.is_company_admin) || isCompanyAdminWorkPart((myProf as { work_part?: string | null } | null)?.work_part);
  const effectiveCompany = isCompanyAdminRole && qCompany === BLOCKED_COMPANY ? "" : qCompany;

  const loadProfiles = async (includeRoleFlags: boolean) => {
    const columns = [
      "id",
      "approval_status",
      "name",
      "phone",
      "birthdate",
      "work_part",
      "company_name",
      "work_table",
      "join_date",
      "leave_date",
      "is_admin",
    ];
    if (includeRoleFlags) {
      columns.push("is_general_admin", "is_company_admin");
    }

    let q = guard.sbAdmin
      .from("profiles")
      .select(columns.join(","))
      .not("work_part", "ilike", "%\uAE30\uC0AC%");

    if (qName) q = q.ilike("name", `%${qName}%`);
    if (qPart) q = q.eq("work_part", qPart);
    if (isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
    if (effectiveCompany) q = q.eq("company_name", effectiveCompany);
    if (qWorkTable) q = q.eq("work_table", qWorkTable);

    return await q;
  };

  let { data, error } = await loadProfiles(true);
  if (isMissingColumnError(error, "is_general_admin") || isMissingColumnError(error, "is_company_admin")) {
    ({ data, error } = await loadProfiles(false));
  }
  if (error) return json(false, error.message, null, 500);

  const rows = ((data ?? []) as unknown as ProfileRow[]).map((row) => ({
    ...row,
    work_part: displayWorkPart(row.work_part),
  }));
  const ids = rows.map((r) => r.id);

  const todayShiftMap: Record<string, { inAt: string | null; outAt: string | null }> = {};
  if (ids.length > 0) {
    const { data: shifts, error: sErr } = await guard.sbAdmin
      .from("work_shifts")
      .select("user_id,clock_in_at,clock_out_at")
      .eq("work_date", kstTodayYMD())
      .in("user_id", ids);
    if (sErr) return json(false, sErr.message, null, 500);

    for (const r of (shifts ?? []) as ShiftTodayRow[]) {
      todayShiftMap[r.user_id] = { inAt: r.clock_in_at, outAt: r.clock_out_at };
    }
  }

  return json(true, undefined, { rows, todayShiftMap, isCompanyAdminRole });
}
