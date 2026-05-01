import { NextRequest, NextResponse } from "next/server";
import { computeChecklistCounts } from "@/lib/operation-checklist-compute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * 매일 아침 9시(KST) 에 통합체크리스트를 미리 계산하여 R2 캐시에 저장.
 * 사용자가 처음 들어올 때 엑셀 파싱 대기 없이 즉시 응답.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const { counts, sources, cache_hit } = await computeChecklistCounts({ force: true });
    return NextResponse.json({
      ok: true,
      counts,
      sources,
      cache_hit,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "Unexpected error",
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
