import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

const VALID_STATUSES = ["pending", "approved", "resigned", "rejected"] as const;
type ApprovalStatus = (typeof VALID_STATUSES)[number];

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = String(body.userId ?? "").trim();
  if (!userId) return json(false, "userId가 필요합니다.", null, 400);

  const status = String(body.approval_status ?? "") as ApprovalStatus;
  if (!VALID_STATUSES.includes(status)) return json(false, "유효하지 않은 상태입니다.", null, 400);

  const { error } = await guard.sbAdmin
    .from("profiles")
    .update({ approval_status: status })
    .eq("id", userId);
  if (error) return json(false, error.message, null, 500);

  // 퇴사 → 앱 로그인 차단 / 그 외 → 차단 해제
  if (status === "resigned") {
    await guard.sbAdmin.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
  } else {
    await guard.sbAdmin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  }

  return json(true, undefined, null);
}
