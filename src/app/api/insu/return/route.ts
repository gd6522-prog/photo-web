import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/insu/return  { barcode: string }
export async function POST(req: NextRequest) {
  try {
    const { barcode } = await req.json();
    if (!barcode) return NextResponse.json({ error: "바코드 없음" }, { status: 400 });

    const { data: receipt, error: findErr } = await supabaseAdmin
      .from("insu_receipts")
      .select("id, barcode, store_name, store_code, reason_name, truck_no, seq_no, is_returned, delivery_date")
      .eq("barcode", barcode.trim())
      .maybeSingle();

    if (findErr) throw findErr;
    if (!receipt) return NextResponse.json({ error: "바코드를 찾을 수 없습니다" }, { status: 404 });
    if (receipt.is_returned) {
      return NextResponse.json({ alreadyReturned: true, receipt });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("insu_receipts")
      .update({ is_returned: true, returned_at: new Date().toISOString() })
      .eq("id", receipt.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, receipt });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
