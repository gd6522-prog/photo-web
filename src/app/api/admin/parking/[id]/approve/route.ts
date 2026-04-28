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

function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;
    if (!id) return json(false, "id 누락", null, 400);

    const { data: row, error: rErr } = await guard.sbAdmin
      .from("parking_requests")
      .select("id, type, company, name, phone, car_number, visit_date, status")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return json(false, rErr.message, null, 500);
    if (!row) return json(false, "신청 정보를 찾을 수 없습니다.", null, 404);

    const r = row as ParkingRow;
    const today = todayKST();

    const expireDate =
      r.type === "regular" ? "2999-12-31" : r.visit_date ? addDaysYMD(r.visit_date, 2) : addDaysYMD(today, 2);

    // 1) DB 승인 처리
    const { error: uErr } = await guard.sbAdmin
      .from("parking_requests")
      .update({
        status: "approved",
        expire_date: expireDate,
        approved_at: new Date().toISOString(),
        approved_by: guard.uid,
        reject_reason: null,
      })
      .eq("id", id);

    if (uErr) return json(false, uErr.message, null, 500);

    // 2) sregist 자동등록 (활성화된 경우만)
    const autoRegisterEnabled = process.env.SREGIST_AUTO_REGISTER === "true";

    if (!autoRegisterEnabled) {
      return json(true, undefined, { sregistAttempted: false });
    }

    const result = await sregist.registerVehicle({
      carNumber: r.car_number,
      startDate: today,
      endDate: expireDate,
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

    if (!result.success) {
      console.error("[sregist 자동등록 실패]", { id, error: result.error });
    }

    return json(true, undefined, {
      sregistAttempted: true,
      sregistRegistered: result.success,
      sregistError: result.success ? undefined : result.error,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
