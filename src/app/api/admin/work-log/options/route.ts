import { NextRequest } from "next/server";
import { isCompanyAdminFlag } from "@/lib/admin-role";
import { isMissingColumnError } from "@/lib/supabase-compat";
import { json, requireAdmin } from "../../notices/_shared";

const BLOCKED_COMPANY = "한익스프레스";

type ProfileOptionRow = {
  company_name: string | null;
  work_part: string | null;
  work_table: string | null;
};

function uniqSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  let myProf: any = null;
  let meErr: any = null;
  {
    const result = await guard.sbAdmin.from("profiles").select("is_company_admin").eq("id", guard.uid).maybeSingle();
    myProf = result.data;
    meErr = result.error;
  }
  if (isMissingColumnError(meErr, "is_company_admin")) {
    meErr = null;
    myProf = null;
  }
  if (meErr) return json(false, meErr.message, null, 500);

  const isCompanyAdminRole = isCompanyAdminFlag((myProf as { is_company_admin?: boolean | null } | null)?.is_company_admin);

  let q = guard.sbAdmin
    .from("profiles")
    .select("company_name,work_part,work_table")
    .not("work_part", "ilike", "%기사%");
  if (isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);

  const { data, error } = await q;
  if (error) return json(false, error.message, null, 500);

  const rows = (data ?? []) as ProfileOptionRow[];
  const companyOptions = uniqSorted(rows.map((r) => r.company_name));
  const workPartOptions = uniqSorted(rows.map((r) => r.work_part));
  const workTableOptions = uniqSorted(rows.map((r) => r.work_table));

  return json(true, undefined, { isCompanyAdminRole, companyOptions, workPartOptions, workTableOptions });
}
