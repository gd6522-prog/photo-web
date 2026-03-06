import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500, extra?: Record<string, any>) {
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
    const nowYear = new Date().getFullYear();

    const yearFrom =
      typeof body?.yearFrom === "number" && Number.isFinite(body.yearFrom)
        ? body.yearFrom
        : nowYear;

    const yearTo =
      typeof body?.yearTo === "number" && Number.isFinite(body.yearTo)
        ? body.yearTo
        : nowYear + 1;

    if (yearFrom > yearTo) {
      return jsonError("yearFrom은 yearTo보다 클 수 없습니다.", 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return jsonError("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.", 500);
    }

    if (!serviceRoleKey) {
      return jsonError("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.", 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.functions.invoke("sync-holidays", {
      body: {
        yearFrom,
        yearTo,
      },
    });

    if (error) {
      return jsonError(
        error.message || "sync-holidays 함수 호출에 실패했습니다.",
        500,
        { detail: error }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "공휴일 동기화 완료",
      data: {
        fromY: data?.fromY ?? yearFrom,
        toY: data?.toY ?? yearTo,
        inserted: data?.inserted ?? 0,
        updated: data?.updated ?? 0,
        upserted:
          data?.upserted ??
          (Number(data?.inserted ?? 0) + Number(data?.updated ?? 0)),
        skipped: data?.skipped ?? 0,
      },
    });
  } catch (e: any) {
    return jsonError(e?.message ?? "알 수 없는 오류", 500);
  }
}