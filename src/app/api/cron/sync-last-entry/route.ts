import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SYNC_DAYS = 60; // 최근 60일 입차내역으로 last_entry_at 갱신

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

function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// "2026-05-06 12:42" (KST) → ISO timestamptz
function kstToIso(s: string): string | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+09:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, message: "Missing Supabase env" }, { status: 500 });
  }

  const today = todayKST();
  const startdate = addDaysYMD(today, -SYNC_DAYS);
  const enddate = today;

  try {
    // 1) sregist 페이지 순회 → 차량별 max in_time 수집
    const lastIn = new Map<string, string>(); // carNumber → ISO string

    let page = 1;
    const MAX_PAGES = 200; // 안전장치
    while (page <= MAX_PAGES) {
      const r = await sregist.searchInoutHistory({ startdate, enddate, page });
      if (!r.success) {
        return NextResponse.json(
          { ok: false, message: `sregist 조회 실패: ${r.error}` },
          { status: 502 }
        );
      }
      for (const it of r.items) {
        if (!it.vNo || !it.inTime) continue;
        const iso = kstToIso(it.inTime);
        if (!iso) continue;
        const prev = lastIn.get(it.vNo);
        if (!prev || prev < iso) lastIn.set(it.vNo, iso);
      }
      if (page >= r.totalPages || r.items.length === 0) break;
      page++;
    }

    // 2) parking_requests UPDATE — 차량번호별 sequential update (Supabase 단일 update 는
    //    여러 row 를 같은 값으로만 갱신 가능하므로, 차량번호별 다른 last_entry_at 적용 위해
    //    개별 호출. 차량 수가 보통 수백 단위라 충분히 빠름.)
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
    let updated = 0;
    let failed = 0;

    for (const [vNo, iso] of lastIn) {
      const { error } = await sb
        .from("parking_requests")
        .update({ last_entry_at: iso })
        .eq("car_number", vNo);
      if (error) failed++;
      else updated++;
    }

    return NextResponse.json({
      ok: true,
      asOf: today,
      range: `${startdate} ~ ${enddate}`,
      sregistDistinctCars: lastIn.size,
      updated,
      failed,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
