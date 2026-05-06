import { NextRequest, NextResponse } from "next/server";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 100 부분일치 검색 + 삭제 호출이 있어 기본 10초 timeout 으로는 부족할 수 있음
export const maxDuration = 60;

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const today = todayKST();

  try {
    const all = await sregist.listAllVehicles();

    // 만료 방문차량: edate가 정상 날짜이고(=정기인 2999-12-31 제외) edate <= today.
    // - visitor 는 edate=visit_date+2 → "today >= edate" 시점에 D+1 까지 유효기간이 끝남.
    // - 정기차량은 edate=2999-12-31 이라 자동 제외됨.
    const candidates = all.filter(
      (v) => v.edate !== "2999-12-31" && VALID_DATE_RE.test(v.edate) && v.edate <= today
    );

    const results: Array<{ sn: string; vNo: string; edate: string; ok: boolean; error?: string }> = [];
    for (const v of candidates) {
      const r = await sregist.deleteVehicle(v.sn);
      results.push({ sn: v.sn, vNo: v.vNo, edate: v.edate, ok: r.success, error: r.success ? undefined : r.error });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    return NextResponse.json({
      ok: true,
      asOf: today,
      scanned: all.length,
      candidates: candidates.length,
      deleted: okCount,
      failed: failCount,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
