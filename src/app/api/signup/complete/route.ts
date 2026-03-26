import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { json } from "../../admin/notices/_shared";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(false, "Missing Supabase env", null, 500);
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) return json(false, "Unauthorized", null, 401);

  // 토큰으로 사용자 확인 (anon client)
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return json(false, "Unauthorized", null, 401);

  const uid = userData.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(false, "Invalid JSON", null, 400);
  }

  const { phone, name, work_part, birthdate, nationality, language } = body ?? {};
  if (!phone || !name || !work_part || !birthdate || !nationality) {
    return json(false, "필수 항목이 누락되었습니다.", null, 400);
  }

  // service role 클라이언트로 profiles upsert → RLS 완전 우회
  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: profErr } = await sbAdmin.from("profiles").upsert(
    {
      id: uid,
      phone,
      name,
      work_part,
      birthdate,
      nationality,
      language: language ?? "ko",
      phone_verified: true,
    },
    { onConflict: "id" }
  );

  if (profErr) return json(false, profErr.message, null, 500);

  return json(true, undefined, { userId: uid });
}
