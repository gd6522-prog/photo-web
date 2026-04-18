import { NextRequest, NextResponse } from "next/server";
import { getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

// R2에 저장된 슬롯 스케줄 경로 (slot-schedules route와 동일)
const R2_KEY = "file-uploads/slot-schedules.json";

// 에이전트 전용 내부 엔드포인트:
// 브라우저 JWT 없이 INTERNAL_API_SECRET 헤더로 인증합니다.
// 이 시크릿은 .env.local의 MIGRATION_SECRET 값과 동일하게 사용합니다.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  const expected = process.env.MIGRATION_SECRET ?? "";

  // 시크릿이 없거나 불일치 시 401 반환
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const text = await getR2ObjectText(R2_KEY);
    // 스케줄이 아직 없으면 빈 객체 반환 (에이전트가 정상 처리)
    const schedules = text ? JSON.parse(text) : {};
    return NextResponse.json({ ok: true, schedules });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
