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
  nationality: string | null;
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

  // requireAdmin에서 이미 내 프로필을 조회했으므로 추가 쿼리 불필요
  const isCompanyAdminRole =
    isCompanyAdminFlag(guard.myIsCompanyAdmin) || isCompanyAdminWorkPart(guard.myWorkPart);
  const effectiveCompany = isCompanyAdminRole && qCompany === BLOCKED_COMPANY ? "" : qCompany;

  // 오늘 출퇴근 조회를 profiles 목록 조회와 병렬 실행
  const shiftsPromise = guard.sbAdmin
    .from("work_shifts")
    .select("user_id,clock_in_at,clock_out_at")
    .eq("work_date", kstTodayYMD());

  const loadProfiles = async (includeRoleFlags: boolean) => {
    const columns = [
      "id",
      "approval_status",
      "name",
      "phone",
      "birthdate",
      "work_part",
      "center",
      "company_name",
      "work_table",
      "join_date",
      "leave_date",
      "nationality",
      "is_admin",
    ];
    if (includeRoleFlags) {
      columns.push("is_general_admin", "is_company_admin");
    }

    let q = guard.sbAdmin
      .from("profiles")
      .select(columns.join(","))
      .or("work_part.is.null,work_part.not.ilike.%기사%");

    if (qName) q = q.ilike("name", `%${qName}%`);
    if (qPart) q = q.eq("work_part", qPart);
    if (isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
    if (effectiveCompany) q = q.eq("company_name", effectiveCompany);
    if (qWorkTable) q = q.eq("work_table", qWorkTable);

    return await q;
  };

  const nationalityOptionsPromise = guard.sbAdmin
    .from("profiles")
    .select("nationality")
    .not("nationality", "is", null)
    .neq("nationality", "")
    .limit(500);

  // profiles 목록과 오늘 출퇴근을 병렬로 실행
  let [{ data, error }, shiftsResult, nationalityResult] = await Promise.all([loadProfiles(true), shiftsPromise, nationalityOptionsPromise]);
  if (isMissingColumnError(error, "is_general_admin") || isMissingColumnError(error, "is_company_admin")) {
    ({ data, error } = await loadProfiles(false));
  }
  if (isMissingColumnError(error, "nationality")) {
    error = null;
  }
  if (error) return json(false, error.message, null, 500);
  if (shiftsResult.error) return json(false, shiftsResult.error.message, null, 500);

  const rows = ((data ?? []) as unknown as ProfileRow[]).map((row) => ({
    ...row,
    work_part: displayWorkPart(row.work_part),
  }));

  const todayShiftMap: Record<string, { inAt: string | null; outAt: string | null }> = {};
  for (const r of (shiftsResult.data ?? []) as ShiftTodayRow[]) {
    todayShiftMap[r.user_id] = { inAt: r.clock_in_at, outAt: r.clock_out_at };
  }

  const nationalityOptions = nationalityResult.error
    ? []
    : Array.from(
        new Set(
          ((nationalityResult.data ?? []) as { nationality: string | null }[])
            .map((r) => (r.nationality ?? "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "ko"));

  return json(true, undefined, { rows, todayShiftMap, isCompanyAdminRole, nationalityOptions });
}
