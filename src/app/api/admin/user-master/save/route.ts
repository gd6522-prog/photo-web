import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { isMissingColumnError } from "@/lib/supabase-compat";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(false, "잘못된 요청입니다.", null, 400);
  }

  const userId = String(body.userId ?? "").trim();
  if (!userId) return json(false, "userId가 필요합니다.", null, 400);

  const payload: Record<string, unknown> = {
    name: body.name ?? null,
    phone: body.phone ?? null,
    birthdate: body.birthdate ?? null,
    work_part: body.work_part ?? null,
    center: body.center ?? null,
    company_name: body.company_name ?? null,
    work_table: body.work_table ?? null,
    join_date: body.join_date ?? null,
    leave_date: body.leave_date ?? null,
    nationality: body.nationality ?? null,
    visa: body.visa ?? null,
    is_admin: !!body.is_admin,
    is_general_admin: !!body.is_general_admin,
    is_center_admin: !!body.is_center_admin,
    is_company_admin: !!body.is_company_admin,
    approval_status: body.approval_status ?? null,
  };

  // 업체관리자는 is_admin 변경 불가
  if (guard.myIsCompanyAdmin) {
    const { data: current } = await guard.sbAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    payload.is_admin = !!(current as any)?.is_admin;
  }

  let { error } = await guard.sbAdmin.from("profiles").update(payload).eq("id", userId);

  if (isMissingColumnError(error, "is_general_admin")) {
    const { is_general_admin: _g, ...p2 } = payload;
    ({ error } = await guard.sbAdmin.from("profiles").update(p2).eq("id", userId));
    if (isMissingColumnError(error, "is_center_admin")) {
      const { is_center_admin: _ct, ...p3 } = p2;
      ({ error } = await guard.sbAdmin.from("profiles").update(p3).eq("id", userId));
      if (isMissingColumnError(error, "is_company_admin")) {
        const { is_company_admin: _c, ...p4 } = p3;
        ({ error } = await guard.sbAdmin.from("profiles").update(p4).eq("id", userId));
      }
    } else if (isMissingColumnError(error, "is_company_admin")) {
      const { is_company_admin: _c, ...p3 } = p2;
      ({ error } = await guard.sbAdmin.from("profiles").update(p3).eq("id", userId));
    }
  } else if (isMissingColumnError(error, "is_center_admin")) {
    const { is_center_admin: _ct, ...p2 } = payload;
    ({ error } = await guard.sbAdmin.from("profiles").update(p2).eq("id", userId));
    if (isMissingColumnError(error, "is_company_admin")) {
      const { is_company_admin: _c, ...p3 } = p2;
      ({ error } = await guard.sbAdmin.from("profiles").update(p3).eq("id", userId));
    }
  } else if (isMissingColumnError(error, "is_company_admin")) {
    const { is_company_admin: _c, ...p2 } = payload;
    ({ error } = await guard.sbAdmin.from("profiles").update(p2).eq("id", userId));
  }

  if (error) return json(false, error.message, null, 500);
  return json(true, undefined, null);
}
