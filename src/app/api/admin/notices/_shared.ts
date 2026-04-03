import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function norm(v: any) {
  return String(v ?? "").trim();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function json(ok: boolean, message?: string, extra?: any, status = 200) {
  return NextResponse.json({ ok, ...(message ? { message } : {}), ...(extra ?? {}) }, { status });
}

export async function requireAdmin(req: NextRequest): Promise<
  | { ok: false; res: NextResponse }
  | { ok: true; sbAdmin: SupabaseClient; uid: string; email: string; isMainAdmin: boolean; myWorkPart: string | null; myIsCompanyAdmin: boolean | null }
> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, res: json(false, "Missing Supabase env", null, 500) };
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, res: json(false, "Missing SUPABASE_SERVICE_ROLE_KEY", null, 500) };

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) {
    return { ok: false, res: json(false, "로그인 정보가 없습니다. 새로고침 후 다시 로그인해 주세요.", null, 401) };
  }

  // 1) 토큰 검증은 anon client로
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let { data: userData, error: uErr } = await sbAnon.auth.getUser(token);
  if (uErr || !userData?.user) {
    await delay(250);
    const retry = await sbAnon.auth.getUser(token);
    userData = retry.data;
    uErr = retry.error;
  }
  if (uErr || !userData?.user) {
    return { ok: false, res: json(false, "로그인 정보가 만료되었습니다. 잠시 후 다시 시도해 주세요.", null, 401) };
  }

  const uid = userData.user.id;
  const email = userData.user.email ?? "";

  // 2) DB 조회/수정은 service role client로 (RLS 우회)
  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: prof, error: pErr } = await sbAdmin
    .from("profiles")
    .select("id, work_part, is_admin, is_company_admin, approval_status")
    .eq("id", uid)
    .maybeSingle();

  if (pErr) return { ok: false, res: json(false, pErr.message, null, 500) };
  if (prof && (prof as any).approval_status && (prof as any).approval_status !== "approved") {
    return { ok: false, res: json(false, "Not approved", null, 403) };
  }

  const hardMain = isMainAdminIdentity(uid, email);
  const dbMain = !!(prof as any)?.is_admin;
  const main = hardMain || dbMain;

  const general = isGeneralAdminWorkPart((prof as any)?.work_part);
  const isAdmin = main || general;

  if (!isAdmin) return { ok: false, res: json(false, "Forbidden", null, 403) };

  return {
    ok: true,
    sbAdmin,
    uid,
    email,
    isMainAdmin: main,
    myWorkPart: (prof as any)?.work_part ?? null,
    myIsCompanyAdmin: (prof as any)?.is_company_admin ?? null,
  };
}
