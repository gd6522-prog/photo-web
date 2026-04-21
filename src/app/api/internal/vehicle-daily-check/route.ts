import { NextRequest, NextResponse } from "next/server";
import { getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

const CURRENT_PATH = "vehicle-data/current/latest.json";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  const expected = process.env.MIGRATION_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const text = await getR2ObjectText(CURRENT_PATH);
    if (!text) return NextResponse.json({ ok: true, found: false, uploadedAt: null });

    const data = JSON.parse(text) as { uploadedAt?: string };
    const uploadedAt = data.uploadedAt ?? null;

    // 오늘 날짜(KST)와 비교
    const today = new Date().toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).replace(/\. /g, "-").replace(".", ""); // "2026-04-21"

    const uploadDate = uploadedAt ? uploadedAt.substring(0, 10) : null;
    const found = uploadDate === today;

    return NextResponse.json({ ok: true, found, uploadedAt, today });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
