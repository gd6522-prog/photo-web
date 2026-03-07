import { SupabaseClient } from "@supabase/supabase-js";
import { isCompanyAdminWorkPart } from "@/lib/admin-role";

export const BLOCKED_COMPANY = "한익스프레스";

export type WorkLogProfileRow = {
  id: string;
  name: string | null;
  work_part: string | null;
  company_name: string | null;
  work_table: string | null;
  join_date: string | null;
};

export async function getWorkLogScope(sbAdmin: SupabaseClient, uid: string) {
  const { data: myProf, error: meErr } = await sbAdmin.from("profiles").select("work_part").eq("id", uid).maybeSingle();
  if (meErr) throw meErr;
  const isCompanyAdminRole = isCompanyAdminWorkPart((myProf as { work_part?: string | null } | null)?.work_part);
  return { isCompanyAdminRole };
}

export async function getWorkLogProfiles(
  sbAdmin: SupabaseClient,
  scope: { isCompanyAdminRole: boolean },
  filters: { nameQ?: string; company?: string; workPart?: string; workTable?: string }
) {
  const qName = String(filters.nameQ ?? "").trim();
  const qCompany = String(filters.company ?? "").trim();
  const qWorkPart = String(filters.workPart ?? "").trim();
  const qWorkTable = String(filters.workTable ?? "").trim();
  const effectiveCompany = scope.isCompanyAdminRole && qCompany === BLOCKED_COMPANY ? "" : qCompany;

  let q = sbAdmin
    .from("profiles")
    .select("id,name,work_part,company_name,work_table,join_date")
    .not("work_part", "ilike", "%기사%")
    .order("name", { ascending: true });

  if (qName) q = q.ilike("name", `%${qName}%`);
  if (scope.isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
  if (effectiveCompany) q = q.eq("company_name", effectiveCompany);
  if (qWorkPart) q = q.eq("work_part", qWorkPart);
  if (qWorkTable) q = q.eq("work_table", qWorkTable);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WorkLogProfileRow[];
}

