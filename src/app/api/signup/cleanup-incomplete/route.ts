import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { json } from "../../admin/notices/_shared";

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

  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return json(false, "Unauthorized", null, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const uid = userData.user.id;

  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("approval_status, phone_verified, birthdate, nationality")
    .eq("id", uid)
    .maybeSingle();

  if (profErr) return json(false, profErr.message, null, 500);

  const incomplete =
    !prof ||
    prof.phone_verified !== true ||
    !prof.birthdate ||
    !String(prof.nationality ?? "").trim() ||
    String(prof.approval_status ?? "").trim() === "";

  if (!incomplete) return json(false, "Refusing to delete completed account", null, 400);

  const { error: deleteProfErr } = await admin.from("profiles").delete().eq("id", uid);
  if (deleteProfErr) return json(false, deleteProfErr.message, null, 500);

  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(uid);
  if (deleteUserErr && !String(deleteUserErr.message ?? "").toLowerCase().includes("not found")) {
    return json(false, deleteUserErr.message, null, 500);
  }

  return json(true, undefined, { deletedUserId: uid });
}
