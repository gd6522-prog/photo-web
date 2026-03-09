import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../admin/notices/_shared";

type Body = {
  userId?: string | null;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => ({}))) as Body;
  const userId = String(body.userId ?? "").trim();
  if (!userId) return json(false, "Missing userId", null, 400);

  const { error: deleteProfErr } = await guard.sbAdmin.from("profiles").delete().eq("id", userId);
  if (deleteProfErr) return json(false, deleteProfErr.message, null, 500);

  const { error: deleteUserErr } = await guard.sbAdmin.auth.admin.deleteUser(userId);
  if (deleteUserErr && !String(deleteUserErr.message ?? "").toLowerCase().includes("not found")) {
    return json(false, deleteUserErr.message, null, 500);
  }

  return json(true, undefined, { deletedUserId: userId });
}
