import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isGeneralAdminWorkPart, isCompanyAdminWorkPart, isCenterAdminWorkPart, isCenterAdminFlag, isMainAdminIdentity } from "@/lib/admin-role";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function json(ok: boolean, message?: string, extra?: unknown, status = 200) {
  return NextResponse.json({ ok, ...(message ? { message } : {}), ...((extra as object) ?? {}) }, { status });
}

// ── 프로필 인메모리 캐시 (5분 TTL) ──────────────────────────────────────
type CachedProfile = {
  uid: string;
  email: string;
  isMainAdmin: boolean;
  myWorkPart: string | null;
  myIsCompanyAdmin: boolean | null;
  myIsCenterAdmin: boolean | null;
  expiresAt: number;
};

const profileCache = new Map<string, CachedProfile>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

function getCachedProfile(uid: string): CachedProfile | null {
  const cached = profileCache.get(uid);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    profileCache.delete(uid);
    return null;
  }
  return cached;
}

function setCachedProfile(profile: Omit<CachedProfile, "expiresAt">) {
  profileCache.set(profile.uid, { ...profile, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── JWT uid/email 파싱 (네트워크 없이) ──────────────────────────────────
function parseJwt(token: string): { sub?: string; email?: string; exp?: number } | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(decoded) as { sub?: string; email?: string; exp?: number };
  } catch {
    return null;
  }
}

// ── sbAdmin 싱글턴 (재생성 비용 절약) ───────────────────────────────────
let _sbAdmin: SupabaseClient | null = null;
function getSbAdmin(): SupabaseClient {
  if (!_sbAdmin) {
    _sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return _sbAdmin;
}

export async function requireAdmin(req: NextRequest): Promise<
  | { ok: false; res: NextResponse }
  | { ok: true; sbAdmin: SupabaseClient; uid: string; email: string; isMainAdmin: boolean; myWorkPart: string | null; myIsCompanyAdmin: boolean | null; myIsCenterAdmin: boolean | null }
> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, res: json(false, "Missing Supabase env", null, 500) };
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, res: json(false, "Missing SUPABASE_SERVICE_ROLE_KEY", null, 500) };

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) return { ok: false, res: json(false, "로그인 정보가 없습니다. 새로고침 후 다시 로그인해 주세요.", null, 401) };

  // 1) JWT 로컬 파싱으로 uid/email 추출 (네트워크 0회)
  const claims = parseJwt(token);
  if (!claims?.sub) return { ok: false, res: json(false, "유효하지 않은 토큰입니다.", null, 401) };
  if (claims.exp && Date.now() / 1000 > claims.exp) return { ok: false, res: json(false, "로그인 정보가 만료되었습니다.", null, 401) };

  const uid = claims.sub;
  const email = claims.email ?? "";
  const sbAdmin = getSbAdmin();

  // 2) 캐시 히트 시 DB 조회 스킵
  const cached = getCachedProfile(uid);
  if (cached) {
    return { ok: true, sbAdmin, uid, email, isMainAdmin: cached.isMainAdmin, myWorkPart: cached.myWorkPart, myIsCompanyAdmin: cached.myIsCompanyAdmin, myIsCenterAdmin: cached.myIsCenterAdmin };
  }

  // 3) 캐시 미스: 프로필 1회 조회
  const { data: prof, error: pErr } = await sbAdmin
    .from("profiles")
    .select("id, work_part, is_admin, is_company_admin, is_center_admin, approval_status")
    .eq("id", uid)
    .maybeSingle();

  if (pErr) return { ok: false, res: json(false, pErr.message, null, 500) };
  if (prof && (prof as { approval_status?: string }).approval_status && (prof as { approval_status?: string }).approval_status !== "approved") {
    return { ok: false, res: json(false, "Not approved", null, 403) };
  }

  const hardMain = isMainAdminIdentity(uid, email);
  const dbMain = !!(prof as { is_admin?: boolean } | null)?.is_admin;
  const main = hardMain || dbMain;
  const general = isGeneralAdminWorkPart((prof as { work_part?: string } | null)?.work_part ?? null);
  const company = isCompanyAdminWorkPart((prof as { work_part?: string } | null)?.work_part ?? null);
  const center = isCenterAdminWorkPart((prof as { work_part?: string } | null)?.work_part ?? null)
    || isCenterAdminFlag((prof as { is_center_admin?: boolean } | null)?.is_center_admin ?? null);

  if (!main && !general && !company && !center) return { ok: false, res: json(false, "Forbidden", null, 403) };

  const result = {
    uid,
    email,
    isMainAdmin: main,
    myWorkPart: (prof as { work_part?: string } | null)?.work_part ?? null,
    myIsCompanyAdmin: (prof as { is_company_admin?: boolean } | null)?.is_company_admin ?? null,
    myIsCenterAdmin: (prof as { is_center_admin?: boolean } | null)?.is_center_admin ?? null,
  };

  setCachedProfile(result);

  return { ok: true, sbAdmin, ...result };
}
