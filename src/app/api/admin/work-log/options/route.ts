import { NextRequest } from "next/server";
import { isCompanyAdminWorkPart } from "@/lib/admin-role";
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

  const { data: myProf, error: meErr } = await guard.sbAdmin.from("profiles").select("work_part").eq("id", guard.uid).maybeSingle();
  if (meErr) return json(false, meErr.message, null, 500);

  const isCompanyAdminRole = isCompanyAdminWorkPart((myProf as { work_part?: string | null } | null)?.work_part);

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

