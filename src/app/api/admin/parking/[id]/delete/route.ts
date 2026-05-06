import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../notices/_shared";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type ParkingRow = {
  id: string;
  car_number: string;
  status: "pending" | "approved" | "rejected" | "expired";
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;
    if (!id) return json(false, "id 누락", null, 400);

    const { data: row, error: rErr } = await guard.sbAdmin
      .from("parking_requests")
      .select("id, car_number, status")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return json(false, rErr.message, null, 500);
    if (!row) return json(false, "신청 정보를 찾을 수 없습니다.", null, 404);

    const r = row as ParkingRow;

    // sregist 측 차량 등록도 함께 정리 (있으면 삭제, 없으면 무시).
    // sregist 호출 자체 실패해도 Drido DB 삭제는 진행 (장애 격리).
    let sregistDeleted: boolean | null = null;
    let sregistError: string | undefined;

    if (process.env.SREGIST_AUTO_REGISTER === "true") {
      try {
        const found = await sregist.findRegisteredVehicle(r.car_number);
        if (found.ok && found.exists) {
          const dr = await sregist.deleteVehicle(found.sn);
          sregistDeleted = dr.success;
          if (!dr.success) sregistError = dr.error;
        } else if (found.ok && !found.exists) {
          sregistDeleted = null; // 애초에 등록 없음
        } else if (!found.ok) {
          sregistError = found.error;
        }
      } catch (e) {
        sregistError = e instanceof Error ? e.message : String(e);
        console.error("[sregist 삭제 예외]", { id, car_number: r.car_number, e });
      }
    }

    // Drido DB hard delete
    const { error: dErr } = await guard.sbAdmin.from("parking_requests").delete().eq("id", id);
    if (dErr) return json(false, dErr.message, null, 500);

    return json(true, undefined, {
      sregistDeleted,
      sregistError,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
