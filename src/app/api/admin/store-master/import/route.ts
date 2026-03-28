import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Row = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time?: string;
  address?: string;
};

function normalizeStoreCode(v: string) {
  const digits = (v ?? "").toString().replace(/\D/g, "");
  if (!digits) return (v ?? "").toString().trim();
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function findDuplicates(rows: Row[]) {
  const map = new Map<string, number>();
  const dups: string[] = [];
  for (const r of rows) {
    const code = normalizeStoreCode(String(r.store_code ?? ""));
    const c = (map.get(code) ?? 0) + 1;
    map.set(code, c);
    if (c === 2) dups.push(code);
  }
  return dups;
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
    const rows = (body?.rows ?? []) as Row[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, message: "업로드 데이터가 비어 있습니다." }, { status: 400 });
    }

    const cleanedAll: Row[] = rows.map((r) => ({
      store_code: normalizeStoreCode(String(r.store_code ?? "").trim()),
      store_name: String(r.store_name ?? "").trim(),
      car_no: String(r.car_no ?? "").trim(),
      seq_no: Number(r.seq_no ?? 0),
      delivery_due_time: String(r.delivery_due_time ?? "").trim(),
      address: String(r.address ?? "").trim(),
    }));

    // ✅ 호차번호 빈 값 제외
    const received = cleanedAll.length;
    const cleaned = cleanedAll.filter((r) => !!r.car_no);
    const skippedNoCar = received - cleaned.length;

    if (cleaned.length === 0) {
      return NextResponse.json(
        { ok: false, message: "반영할 데이터가 없습니다. (호차번호가 비어있는 행만 존재)" },
        { status: 400 }
      );
    }

    // 중복 체크
    const dupCodes = findDuplicates(cleaned);
    if (dupCodes.length > 0) {
      return NextResponse.json(
        { ok: false, message: "점포코드 중복이 있어 반영이 중단되었습니다.", duplicates: dupCodes },
        { status: 400 }
      );
    }

    // 필수값 체크
    for (const r of cleaned) {
      if (!r.store_code) return NextResponse.json({ ok: false, message: "store_code가 비어있는 행이 있습니다." }, { status: 400 });
      if (!r.store_name) return NextResponse.json({ ok: false, message: `점포명이 비어 있습니다. (${r.store_code})` }, { status: 400 });
      if (!r.car_no) return NextResponse.json({ ok: false, message: `호차번호가 비어 있습니다. (${r.store_code})` }, { status: 400 });
      if (!Number.isFinite(r.seq_no) || r.seq_no <= 0) return NextResponse.json({ ok: false, message: `순번이 올바르지 않습니다. (${r.store_code})` }, { status: 400 });
    }

    const supabase = createClient(url, serviceKey);
    const now = new Date().toISOString();

    // ✅ 점포마스터만 upsert (검수점포(is_inspection)는 건드리지 않음)
    const upsertRows = cleaned.map((r) => ({ ...r, updated_at: now }));

    const { error: upErr } = await supabase
      .from("store_map")
      .upsert(upsertRows, { onConflict: "store_code" });

    if (upErr) throw upErr;

    // ✅ 이번 업로드에 없는 구 점포 삭제 (photos FK는 ON DELETE SET NULL이므로 사진은 유지됨)
    const newCodes = cleaned.map((r) => r.store_code);
    const { count: deletedCount, error: delErr } = await supabase
      .from("store_map")
      .delete({ count: "exact" })
      .not("store_code", "in", `(${newCodes.join(",")})`);

    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, count: upsertRows.length, skippedNoCar, deleted: deletedCount ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? String(e) }, { status: 500 });
  }
}
