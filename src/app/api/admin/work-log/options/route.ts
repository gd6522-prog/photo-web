import { NextRequest } from "next/server";
import { getErrorMessage, isMissingColumnError } from "@/lib/supabase-compat";
import { json, requireAdmin } from "../../notices/_shared";
import { BLOCKED_COMPANY, getWorkLogScope } from "../_shared";

const EXCLUDED_WORK_PART_KEYWORD = "\uAE30\uC0AC";

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

  try {
    const scope = await getWorkLogScope(guard.sbAdmin, guard.uid);

    const load = async (includeWorkTable: boolean) => {
      const columns = includeWorkTable ? "company_name,work_part,work_table" : "company_name,work_part";
      let q = guard.sbAdmin.from("profiles").select(columns).not("work_part", "ilike", `%${EXCLUDED_WORK_PART_KEYWORD}%`);
      if (scope.isCompanyAdminRole) q = q.neq("company_name", BLOCKED_COMPANY);
      return await q;
    };

    let result = await load(true);
    if (result.error && isMissingColumnError(result.error, "work_table")) result = await load(false);
    if (result.error) return json(false, result.error.message, null, 500);

    const rows = ((result.data ?? []) as unknown[]) as ProfileOptionRow[];
    const companyOptions = uniqSorted(rows.map((r) => r.company_name));
    const workPartOptions = uniqSorted(rows.map((r) => r.work_part));
    const workTableOptions = uniqSorted(rows.map((r) => r.work_table));

    return json(true, undefined, { isCompanyAdminRole: scope.isCompanyAdminRole, companyOptions, workPartOptions, workTableOptions });
  } catch (e: unknown) {
    console.error("[work-log/options] failed", e);
    return json(false, getErrorMessage(e, "failed to load options"), null, 500);
  }
}
