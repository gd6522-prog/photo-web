import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, message: "환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 설정이 필요합니다." },
        { status: 500 }
      );
    }

    const supabase = createClient(url, serviceKey);

    const { data, error } = await supabase
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no, is_inspection")
      .order("car_no", { ascending: true, nullsFirst: false })
      .order("seq_no", { ascending: true, nullsFirst: false })
      .order("store_code", { ascending: true })
      .limit(5000);

    if (error) throw error;

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? String(e) }, { status: 500 });
  }
}
