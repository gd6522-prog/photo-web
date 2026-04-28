import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../../notices/_shared";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParkingRow = {
  id: string;
  type: "regular" | "visitor";
  company: string;
  name: string;
  phone: string;
  car_number: string;
  visit_date: string | null;
  expire_date: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
};

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;
    if (!id) return json(false, "id 누락", null, 400);

    const { data: row, error: rErr } = await guard.sbAdmin
      .from("parking_requests")
      .select("id, type, company, name, phone, car_number, visit_date, expire_date, status")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return json(false, rErr.message, null, 500);
    if (!row) return json(false, "신청 정보를 찾을 수 없습니다.", null, 404);

    const r = row as ParkingRow;
    if (r.status !== "approved") {
      return json(false, "승인 상태인 신청만 재등록할 수 있습니다.", null, 400);
    }
    if (!r.expire_date) {
      return json(false, "만료일이 비어있습니다.", null, 400);
    }

    const today = todayKST();

    const result = await sregist.registerVehicle({
      carNumber: r.car_number,
      startDate: today,
      endDate: r.expire_date,
      company: r.company,
      dept: r.name,
      memo: r.phone,
    });

    const responseSummary = result.success
      ? result.raw
      : `[ERROR] ${result.error}${result.raw ? `\n${result.raw}` : ""}`;

    await guard.sbAdmin
      .from("parking_requests")
      .update({
        sregist_registered: result.success,
        sregist_registered_at: result.success ? new Date().toISOString() : null,
        sregist_response: responseSummary?.slice(0, 4000) ?? null,
      })
      .eq("id", id);

    return json(true, undefined, {
      sregistRegistered: result.success,
      sregistError: result.success ? undefined : result.error,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
