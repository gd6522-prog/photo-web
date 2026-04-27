import { SupabaseClient } from "@supabase/supabase-js";
import { isCompanyAdminFlag } from "@/lib/admin-role";
import { isMissingColumnError } from "@/lib/supabase-compat";

export const BLOCKED_COMPANY = "\uD55C\uC775\uC2A4\uD504\uB808\uC2A4";
const EXCLUDED_WORK_PART_KEYWORD = "\uAE30\uC0AC";

export type WorkLogProfileRow = {
  id: string;
  name: string | null;
  work_part: string | null;
  company_name: string | null;
  work_table: string | null;
  join_date: string | null;
  employment_type: string | null;
};

export async function getWorkLogScope(sbAdmin: SupabaseClient, uid: string) {
  let myProf: { is_company_admin?: boolean | null } | null = null;
  let meErr: unknown = null;
  {
    const result = await sbAdmin.from("profiles").select("is_company_admin").eq("id", uid).maybeSingle();
    myProf = result.data;
    meErr = result.error;
  }
  if (isMissingColumnError(meErr, "is_company_admin")) {
    meErr = null;
    myProf = null;
  }
  if (meErr) throw meErr;
  const isCompanyAdminRole = isCompanyAdminFlag(myProf?.is_company_admin);
  return { isCompanyAdminRole };
}

export async function getWorkLogProfiles(
  sbAdmin: SupabaseClient,
  scope: { isCompanyAdminRole: boolean },
  filters: { nameQ?: string; company?: string; workPart?: string; workTable?: string; includeResigned?: boolean; excludeTemporary?: boolean }
) {
  const qName = String(filters.nameQ ?? "").trim();
  const qCompany = String(filters.company ?? "").trim();
  const qWorkPart = String(filters.workPart ?? "").trim();
  const qWorkTable = String(filters.workTable ?? "").trim();
  const includeResigned = !!filters.includeResigned;
  const excludeTemporary = !!filters.excludeTemporary;
  const effectiveCompany = scope.isCompanyAdminRole && qCompany === BLOCKED_COMPANY ? "" : qCompany;

  const load = async (includeWorkTable: boolean, includeJoinDate: boolean, applyEmploymentFilter: boolean, includeEmploymentType: boolean) => {
    const columns = ["id", "name", "work_part", "company_name"];
    if (includeWorkTable) columns.push("work_table");
    if (includeJoinDate) columns.push("join_date");
    if (includeEmploymentType) columns.push("employment_type");

    let q = sbAdmin
      .from("profiles")
      .select(columns.join(","))
      .or(`work_part.is.null,work_part.not.ilike.%${EXCLUDED_WORK_PART_KEYWORD}%`)
      .order("name", { ascending: true });

    if (!includeResigned) q = q.neq("approval_status", "resigned");
    if (qName) q = q.ilike("name", `%${qName}%`);
    if (scope.isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
    if (effectiveCompany) q = q.eq("company_name", effectiveCompany);
    if (qWorkPart) q = q.eq("work_part", qWorkPart);
    if (qWorkTable && includeWorkTable) q = q.eq("work_table", qWorkTable);
    if (excludeTemporary && applyEmploymentFilter) {
      q = q.or("employment_type.is.null,employment_type.neq.temporary");
    }

    return await q;
  };

  let result = await load(true, true, true, true);
  if (result.error && isMissingColumnError(result.error, "employment_type")) {
    result = await load(true, true, false, false);
  }
  if (result.error && (isMissingColumnError(result.error, "work_table") || isMissingColumnError(result.error, "join_date"))) {
    const includeWorkTable = !isMissingColumnError(result.error, "work_table");
    const includeJoinDate = !isMissingColumnError(result.error, "join_date");
    result = await load(includeWorkTable, includeJoinDate, true, true);
    if (result.error && isMissingColumnError(result.error, "employment_type")) {
      result = await load(includeWorkTable, includeJoinDate, false, false);
    }
    if (result.error && (isMissingColumnError(result.error, "work_table") || isMissingColumnError(result.error, "join_date"))) {
      result = await load(false, false, false, false);
    }
  }
  if (result.error) throw result.error;

  return ((result.data ?? []) as Array<Partial<WorkLogProfileRow>>).map((row) => ({
    id: String(row.id ?? ""),
    name: row.name ?? null,
    work_part: row.work_part ?? null,
    company_name: row.company_name ?? null,
    work_table: row.work_table ?? null,
    join_date: row.join_date ?? null,
    employment_type: row.employment_type ?? null,
  }));
}
