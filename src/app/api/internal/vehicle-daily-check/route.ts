import { NextRequest, NextResponse } from "next/server";
import { getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

// 납품예정일 계산: 토요일이면 D+2(월요일), 그 외 D+1
function getTargetDeliveryDate(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const dayOfWeek = now.getDay(); // 0=일, 6=토
  const offset = dayOfWeek === 6 ? 2 : 1;
  now.setDate(now.getDate() + offset);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  const expected = process.env.MIGRATION_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const targetDate = getTargetDeliveryDate();
    const text = await getR2ObjectText(`vehicle-data/daily/${targetDate}.json`);
    const found = !!text;
    return NextResponse.json({ ok: true, found, targetDate });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
