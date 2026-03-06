import { NextRequest, NextResponse } from "next/server";
import { kstNowYear, syncHolidaysRange } from "@/lib/holiday-sync";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      message,
      ...(extra || {}),
    },
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nowYear = kstNowYear();

    const yearFrom =
      typeof body?.yearFrom === "number" && Number.isFinite(body.yearFrom) ? body.yearFrom : nowYear;

    const yearTo =
      typeof body?.yearTo === "number" && Number.isFinite(body.yearTo) ? body.yearTo : nowYear + 1;

    if (yearFrom > yearTo) {
      return jsonError("yearFrom cannot be greater than yearTo.", 400);
    }

    const result = await syncHolidaysRange(yearFrom, yearTo);

    return NextResponse.json({
      ok: true,
      message: "공휴일 동기화 완료",
      data: result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonError(message, 500);
  }
}
