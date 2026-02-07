import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type UpdateRow = { store_code: string; is_inspection: boolean };

function normalizeStoreCode(v: string) {
  const digits = (v ?? "").toString().replace(/\D/g, "");
  if (!digits) return (v ?? "").toString().trim();
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, message: "환경변수 설정이 필요합니다." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const updates = (body?.updates ?? []) as UpdateRow[];

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { ok: false, message: "업데이트할 데이터가 없습니다." },
        { status: 400 }
      );
    }

    const supabase = createClient(url, serviceKey);
    const now = new Date().toISOString();

    // true/false로 나눠서 업데이트 (간단하고 안정적)
    const setTrue = updates
      .filter((u) => !!u.is_inspection)
      .map((u) => normalizeStoreCode(String(u.store_code)));

    const setFalse = updates
      .filter((u) => !u.is_inspection)
      .map((u) => normalizeStoreCode(String(u.store_code)));

    let count = 0;

    if (setTrue.length > 0) {
      const { error } = await supabase
        .from("store_map")
        .update({ is_inspection: true, updated_at: now })
        .in("store_code", setTrue);
      if (error) throw error;
      count += setTrue.length;
    }

    if (setFalse.length > 0) {
      const { error } = await supabase
        .from("store_map")
        .update({ is_inspection: false, updated_at: now })
        .in("store_code", setFalse);
      if (error) throw error;
      count += setFalse.length;
    }

    return NextResponse.json({ ok: true, count });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
