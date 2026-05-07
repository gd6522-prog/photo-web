import { NextRequest, NextResponse } from "next/server";
import { buildInventoryCheckRows } from "@/lib/inventory-check-compute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * 매일 KST 09:00 (UTC 00:00) — 재고조사 결과 캐시 사전 빌드.
 * elogis-agent 의 08:00~08:50 다운로드가 모두 끝난 이후 호출되어, 사용자가 처음
 * 페이지에 들어와도 콜드 캐시 부담 없이 즉시 응답.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    // box_manual 한 번 호출하면 buildAllPartsRows 가 모든 작업파트 결과를
    // 한꺼번에 계산하여 R2 결과 캐시에 저장. 다른 part 도 같은 캐시 hit.
    const rows = await buildInventoryCheckRows("box_manual");
    return NextResponse.json({
      ok: true,
      sample_part: "box_manual",
      sample_count: rows.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "error", durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
