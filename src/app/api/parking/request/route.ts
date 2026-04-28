import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_PER_MIN = 5;

const CAR_NUMBER_RE = /^[0-9]{2,3}[가-힣][0-9]{4}$/;
const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function sanitizeStr(v: unknown, max = 200): string {
  return String(v ?? "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

function isValidDateYMD(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00+09:00`);
  return !isNaN(d.getTime());
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

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, message: "서버 설정 오류" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const type = sanitizeStr(body.type, 16);
  const company = sanitizeStr(body.company, 80);
  const name = sanitizeStr(body.name, 40);
  const car_number = sanitizeStr(body.car_number, 20).replace(/\s+/g, "");
  const phone = sanitizeStr(body.phone, 20);
  const visit_date_raw = sanitizeStr(body.visit_date, 16);
  const visit_purpose_raw = sanitizeStr(body.visit_purpose, 200);

  if (type !== "regular" && type !== "visitor") {
    return NextResponse.json({ ok: false, message: "신청 종류가 올바르지 않습니다." }, { status: 400 });
  }
  if (!company) return NextResponse.json({ ok: false, message: "소속(회사명)을 입력해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, message: "이름을 입력해 주세요." }, { status: 400 });
  if (!CAR_NUMBER_RE.test(car_number)) {
    return NextResponse.json({ ok: false, message: "차량번호 형식이 올바르지 않습니다. (예: 12가3456)" }, { status: 400 });
  }
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ ok: false, message: "연락처 형식이 올바르지 않습니다. (예: 010-0000-0000)" }, { status: 400 });
  }

  let visit_date: string | null = null;
  if (type === "visitor") {
    if (!isValidDateYMD(visit_date_raw)) {
      return NextResponse.json({ ok: false, message: "방문 날짜가 올바르지 않습니다." }, { status: 400 });
    }
    if (visit_date_raw < todayKST()) {
      return NextResponse.json({ ok: false, message: "방문 날짜는 오늘 이후로 선택해 주세요." }, { status: 400 });
    }
    visit_date = visit_date_raw;
  }

  const ip = getClientIp(req);

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 동일 차량번호 중복 체크: 대기중이거나, 승인 상태로 아직 만료되지 않은 건이 있으면 차단
  {
    const todayStr = todayKST();
    const { data: existing, error: exErr } = await sb
      .from("parking_requests")
      .select("id, status, expire_date")
      .eq("car_number", car_number)
      .or(`status.eq.pending,and(status.eq.approved,expire_date.gte.${todayStr})`)
      .limit(1);

    if (exErr) {
      return NextResponse.json({ ok: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
    }
    if (existing && existing.length > 0) {
      const e = existing[0] as { status: string };
      const msg = e.status === "pending" ? "이미 신청 대기중인 차량번호입니다." : "이미 등록된 차량번호입니다.";
      return NextResponse.json({ ok: false, message: msg }, { status: 409 });
    }
  }

  // Rate limit: 같은 IP에서 최근 60초 이내 신청 건수
  if (ip && ip !== "unknown") {
    const sinceIso = new Date(Date.now() - 60 * 1000).toISOString();
    const { count, error: cntErr } = await sb
      .from("parking_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", sinceIso);
    if (cntErr) {
      return NextResponse.json({ ok: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
    }
    if ((count ?? 0) >= RATE_LIMIT_PER_MIN) {
      return NextResponse.json(
        { ok: false, message: "잠시 후 다시 시도해 주세요. (요청이 너무 많습니다)" },
        { status: 429 }
      );
    }
  }

  // 정기는 승인 절차 필요 → status=pending, expire=2999 (관리자 승인 시 확정)
  // 방문은 승인 불필요(이력만) → status=approved, expire=visit_date+2 (sregist edate exclusive: 방문일 다음날까지 유효), 즉시 sregist 자동등록 시도
  const isVisitor = type === "visitor";
  const expire_date = type === "regular" ? "2999-12-31" : visit_date ? addDaysYMD(visit_date, 2) : null;

  const nowIso = new Date().toISOString();

  const { data: inserted, error } = await sb
    .from("parking_requests")
    .insert({
      type,
      company,
      name,
      car_number,
      phone,
      visit_date,
      visit_purpose: isVisitor && visit_purpose_raw ? visit_purpose_raw : null,
      expire_date,
      status: isVisitor ? "approved" : "pending",
      approved_at: isVisitor ? nowIso : null,
      ip,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ ok: false, message: "신청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  // 정기신청 신규 등록 시 → 메인/센터 관리자에게 Expo Push 발송 (fire-and-forget)
  if (!isVisitor) {
    try {
      const fnUrl = `${url.replace(/\/$/, "")}/functions/v1/send-parking-push`;
      void fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          request_id: inserted.id,
          company,
          name,
          car_number,
        }),
      }).catch((e) => console.error("[send-parking-push 호출 실패]", e));
    } catch (e) {
      console.error("[send-parking-push 호출 예외]", e);
    }
  }

  // 방문 + 자동등록 활성 시 sregist 즉시 등록 (실패해도 사용자 응답은 성공 — 관리자 페이지에서 재등록 가능)
  if (isVisitor && process.env.SREGIST_AUTO_REGISTER === "true" && expire_date) {
    try {
      const today = todayKST();
      const result = await sregist.registerVehicle({
        carNumber: car_number,
        startDate: today,
        endDate: expire_date,
        company,
        dept: name,
        memo: phone,
      });

      const responseSummary = result.success
        ? result.raw
        : `[ERROR] ${result.error}${result.raw ? `\n${result.raw}` : ""}`;

      await sb
        .from("parking_requests")
        .update({
          sregist_registered: result.success,
          sregist_registered_at: result.success ? new Date().toISOString() : null,
          sregist_response: responseSummary?.slice(0, 4000) ?? null,
        })
        .eq("id", inserted.id);

      if (!result.success) {
        console.error("[sregist 방문 자동등록 실패]", { id: inserted.id, error: result.error });
      }
    } catch (e) {
      console.error("[sregist 방문 자동등록 예외]", e);
    }
  }

  return NextResponse.json({ ok: true });
}
