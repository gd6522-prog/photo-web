import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

const BLOCKED_COMPANY = "한익스프레스";

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

function isCompanyAdminWorkPart(workPart: string | null | undefined) {
  return String(workPart ?? "").trim() === "업체관리자";
}

function displayWorkPart(workPart: string | null): string | null {
  return String(workPart ?? "").trim() === "업체관리자" ? "관리자" : workPart;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const qName = (req.nextUrl.searchParams.get("qName") ?? "").trim();
  const qPart = (req.nextUrl.searchParams.get("qPart") ?? "").trim();
  const qCompany = (req.nextUrl.searchParams.get("qCompany") ?? "").trim();
  const qWorkTable = (req.nextUrl.searchParams.get("qWorkTable") ?? "").trim();

  const { data: myProf, error: meErr } = await guard.sbAdmin.from("profiles").select("work_part").eq("id", guard.uid).maybeSingle();
  if (meErr) return json(false, meErr.message, null, 500);

  const isCompanyAdminRole = isCompanyAdminWorkPart((myProf as { work_part?: string | null } | null)?.work_part);
  const effectiveCompany = isCompanyAdminRole && qCompany === BLOCKED_COMPANY ? "" : qCompany;

  let q = guard.sbAdmin
    .from("profiles")
    .select("id,approval_status,name,phone,birthdate,work_part,company_name,work_table,join_date,leave_date,is_admin")
    .not("work_part", "ilike", "%기사%");

  if (qName) q = q.ilike("name", `%${qName}%`);
  if (qPart) q = q.eq("work_part", qPart);
  if (isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
  if (effectiveCompany) q = q.eq("company_name", effectiveCompany);
  if (qWorkTable) q = q.eq("work_table", qWorkTable);

  const { data, error } = await q;
  if (error) return json(false, error.message, null, 500);

  const rows = ((data ?? []) as ProfileRow[]).map((row) => ({
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
