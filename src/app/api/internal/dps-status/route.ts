import { NextRequest, NextResponse } from "next/server";
import { getR2ObjectText, putR2Object } from "@/lib/r2";
import { requireAdmin, json } from "../../admin/notices/_shared";

export const runtime = "nodejs";

const R2_KEY = "file-uploads/dps-status-cache.json";

// GET: 프론트엔드(requireAdmin)에서 데이터 조회
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const text = await getR2ObjectText(R2_KEY);
    if (!text) return json(true, undefined, { rows: [], scrapedAt: null });
    const data = JSON.parse(text) as { rows: unknown[]; scrapedAt: string };
    return json(true, undefined, data);
  } catch {
    return json(false, "데이터 조회 실패", null, 500);
  }
}

// POST: elogis-agent가 스크래핑 결과를 저장
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  const expected = process.env.MIGRATION_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { rows: unknown[]; scrapedAt?: string };
    const payload = {
      rows: body.rows ?? [],
      scrapedAt: body.scrapedAt ?? new Date().toISOString(),
    };
    await putR2Object(R2_KEY, JSON.stringify(payload), "application/json");
    return NextResponse.json({ ok: true, count: payload.rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
