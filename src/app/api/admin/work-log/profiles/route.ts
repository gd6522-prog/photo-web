import { NextRequest } from "next/server";
import { isCompanyAdminFlag } from "@/lib/admin-role";
import { isMissingColumnError } from "@/lib/supabase-compat";
import { json, requireAdmin } from "../../notices/_shared";

const BLOCKED_COMPANY = "한익스프레스";

type ProfileRow = {
  id: string;
  name: string | null;
  work_part: string | null;
  company_name: string | null;
  work_table: string | null;
  join_date: string | null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const qName = (req.nextUrl.searchParams.get("nameQ") ?? "").trim();
  const qCompany = (req.nextUrl.searchParams.get("company") ?? "").trim();
  const qWorkPart = (req.nextUrl.searchParams.get("workPart") ?? "").trim();
  const qWorkTable = (req.nextUrl.searchParams.get("workTable") ?? "").trim();

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
  const effectiveCompany = isCompanyAdminRole && qCompany === BLOCKED_COMPANY ? "" : qCompany;

  let q = guard.sbAdmin
    .from("profiles")
    .select("id,name,work_part,company_name,work_table,join_date")
    .not("work_part", "ilike", "%기사%")
    .order("name", { ascending: true });

  if (qName) q = q.ilike("name", `%${qName}%`);
  if (isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
  if (effectiveCompany) q = q.eq("company_name", effectiveCompany);
  if (qWorkPart) q = q.eq("work_part", qWorkPart);
  if (qWorkTable) q = q.eq("work_table", qWorkTable);

  const { data, error } = await q;
  if (error) return json(false, error.message, null, 500);

  return json(true, undefined, { rows: (data ?? []) as ProfileRow[], isCompanyAdminRole });
}
