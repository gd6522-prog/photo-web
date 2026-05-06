import { NextRequest, after } from "next/server";
import { json, requireAdmin } from "../../../notices/_shared";
import { sendRejectionAlimtalk } from "@/lib/solapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParkingRow = {
  id: string;
  name: string;
  phone: string;
  car_number: string;
  status: "pending" | "approved" | "rejected" | "expired";
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;
    if (!id) return json(false, "id 누락", null, 400);

    const body = await req.json().catch(() => ({})) as { reason?: string };
    const reason = String(body?.reason ?? "").trim();
    if (!reason) return json(false, "거절 사유를 입력해 주세요.", null, 400);

    const { data: row, error: rErr } = await guard.sbAdmin
      .from("parking_requests")
      .select("id, name, phone, car_number, status")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return json(false, rErr.message, null, 500);
    if (!row) return json(false, "신청 정보를 찾을 수 없습니다.", null, 404);

    const r = row as ParkingRow;

    const { error: uErr } = await guard.sbAdmin
      .from("parking_requests")
      .update({
        status: "rejected",
        reject_reason: reason.slice(0, 300),
      })
      .eq("id", id);

    if (uErr) return json(false, uErr.message, null, 500);

    // 신청자에게 "처리결과(거절)" 알림톡 (응답 후 백그라운드)
    after(async () => {
      try {
        const ar = await sendRejectionAlimtalk({
          to: r.phone,
          name: r.name,
          carNumber: r.car_number,
          reason,
        });
        if (!ar.success) {
          console.error("[알림톡 거절 발송 실패]", { id, error: ar.error });
        }
      } catch (e) {
        console.error("[알림톡 거절 발송 예외]", e);
      }
    });

    return json(true);
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
