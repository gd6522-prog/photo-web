import { NextRequest, NextResponse } from "next/server";
import { kstNowYear, syncHolidaysRange } from "@/lib/holiday-sync";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const y = kstNowYear();
    const result = await syncHolidaysRange(y, y + 1);
    return NextResponse.json({
      ok: true,
      message: "공휴일 자동 동기화 완료",
      data: result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}
