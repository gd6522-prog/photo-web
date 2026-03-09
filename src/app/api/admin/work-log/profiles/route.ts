import { NextRequest } from "next/server";
import { getErrorMessage } from "@/lib/supabase-compat";
import { json, requireAdmin } from "../../notices/_shared";
import { getWorkLogProfiles, getWorkLogScope } from "../_shared";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const scope = await getWorkLogScope(guard.sbAdmin, guard.uid);
    const rows = await getWorkLogProfiles(guard.sbAdmin, scope, {
      nameQ: req.nextUrl.searchParams.get("nameQ") ?? "",
      company: req.nextUrl.searchParams.get("company") ?? "",
      workPart: req.nextUrl.searchParams.get("workPart") ?? "",
      workTable: req.nextUrl.searchParams.get("workTable") ?? "",
    });

    return json(true, undefined, { rows, isCompanyAdminRole: scope.isCompanyAdminRole });
  } catch (e: unknown) {
    return json(false, getErrorMessage(e, "failed to load profiles"), null, 500);
  }
}
