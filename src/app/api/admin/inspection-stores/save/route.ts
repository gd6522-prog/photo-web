import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeStoreCode(v: any) {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 설정이 필요합니다.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const codesRaw = (body?.codes ?? []) as string[];
    const codes = Array.from(new Set(codesRaw.map(normalizeStoreCode))).filter(Boolean);

    const supabase = createClient(url, serviceKey);
    const now = new Date().toISOString();

    // 1) 전체 false로 초기화
    const { error: offErr } = await supabase
      .from("store_map")
      .update({ is_inspection: false, updated_at: now })
      .neq("store_code", ""); // 전체 업데이트 트리거 (항상 true)

    if (offErr) throw offErr;

    // 2) 체크된 코드만 true
    if (codes.length > 0) {
      const { error: onErr } = await supabase
        .from("store_map")
        .update({ is_inspection: true, updated_at: now })
        .in("store_code", codes);

      if (onErr) throw onErr;
    }

    // ✅ count는 supabase-js 버전마다 API가 달라서 안전하게 codes.length로 처리
    return NextResponse.json({ ok: true, trueCount: codes.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
