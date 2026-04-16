import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { getR2ObjectBuffer, listR2Keys, putR2Object } from "@/lib/r2";

const SLOT_KEY = "store-master";
const SLOT_PREFIX = `file-uploads/${SLOT_KEY}/`;
const META_KEY = `file-uploads/${SLOT_KEY}.meta`;

type Row = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time?: string;
  address?: string;
};

function normalizeStoreCode(v: unknown) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return String(v ?? "").trim();
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function normalizeHeader(v: unknown) {
  return String(v ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  for (const c of candidates) {
    const idx = headers.indexOf(normalizeHeader(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function findDuplicates(rows: Row[]) {
  const map = new Map<string, number>();
  const dups: string[] = [];
  for (const r of rows) {
    const code = normalizeStoreCode(r.store_code);
    const c = (map.get(code) ?? 0) + 1;
    map.set(code, c);
    if (c === 2) dups.push(code);
  }
  return dups;
}

function parseBuffer(buf: Buffer): { rows: Row[]; error?: string } {
  const workbook = XLSX.read(buf, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return { rows: [], error: "엑셀 시트를 읽지 못했습니다." };

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as unknown[][];
  if (!rawRows || rawRows.length < 2) return { rows: [], error: "엑셀에 데이터가 없습니다." };

  const headers = rawRows[0].map(normalizeHeader);
  const idxCar  = findHeaderIndex(headers, ["호차번호", "차량번호"]);
  const idxSeq  = findHeaderIndex(headers, ["배송순서", "순번"]);
  const idxCode = findHeaderIndex(headers, ["배송처코드", "점포코드"]);
  const idxName = findHeaderIndex(headers, ["배송처명", "점포명"]);
  const idxDue  = findHeaderIndex(headers, ["납기기준시간", "기준시간", "납품시간", "납품예정시간", "delivery_due_time"]);
  const idxAddr = findHeaderIndex(headers, ["주소", "배송처주소", "address"]);

  if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
    return { rows: [], error: "필수 컬럼을 찾지 못했습니다. 호차번호, 배송순서, 배송처코드, 배송처명이 필요합니다." };
  }

  const parsed: Row[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const line = rawRows[i];
    if (!line) continue;
    const store_code = normalizeStoreCode((line as unknown[])[idxCode]);
    const store_name = String((line as unknown[])[idxName] ?? "").trim();
    const car_no     = String((line as unknown[])[idxCar]  ?? "").trim();
    if (!store_code && !store_name && !car_no) continue;
    if (!store_code) continue;
    const seq_no = Number(String((line as unknown[])[idxSeq] ?? "").trim());
    parsed.push({
      store_code,
      store_name,
      car_no,
      seq_no: Number.isFinite(seq_no) ? seq_no : 0,
      delivery_due_time: idxDue  >= 0 ? String((line as unknown[])[idxDue]  ?? "").trim() : "",
      address:           idxAddr >= 0 ? String((line as unknown[])[idxAddr] ?? "").trim() : "",
    });
  }

  return { rows: parsed };
}

export async function POST(req: Request) {
  try {
    const url        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json({ ok: false, message: "환경변수 설정이 필요합니다." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({})) as { uploaderName?: string };

    // ── R2에서 파일 읽기 ──────────────────────────────────────────────────
    const keys = await listR2Keys(SLOT_PREFIX);
    if (keys.length === 0) {
      return NextResponse.json({ ok: false, message: "R2에 업로드된 파일이 없습니다." }, { status: 404 });
    }
    const r2Key  = keys[0];
    const buffer = await getR2ObjectBuffer(r2Key);
    if (!buffer) {
      return NextResponse.json({ ok: false, message: "R2 파일을 읽지 못했습니다." }, { status: 500 });
    }

    // ── 파싱 ─────────────────────────────────────────────────────────────
    const { rows, error } = parseBuffer(buffer);
    if (error) return NextResponse.json({ ok: false, message: error }, { status: 400 });

    const received      = rows.length;
    const cleaned       = rows.filter((r) => !!r.car_no);
    const skippedNoCar  = received - cleaned.length;

    if (cleaned.length === 0) {
      return NextResponse.json(
        { ok: false, message: "반영할 데이터가 없습니다. (호차번호가 비어있는 행만 존재)" },
        { status: 400 }
      );
    }

    const dupCodes = findDuplicates(cleaned);
    if (dupCodes.length > 0) {
      return NextResponse.json(
        { ok: false, message: "점포코드 중복이 있어 반영이 중단되었습니다.", duplicates: dupCodes },
        { status: 400 }
      );
    }

    for (const r of cleaned) {
      if (!r.store_code) return NextResponse.json({ ok: false, message: "store_code가 비어있는 행이 있습니다." }, { status: 400 });
      if (!r.store_name) return NextResponse.json({ ok: false, message: `점포명이 비어 있습니다. (${r.store_code})` }, { status: 400 });
      if (!r.car_no)     return NextResponse.json({ ok: false, message: `호차번호가 비어 있습니다. (${r.store_code})` }, { status: 400 });
      if (!Number.isFinite(r.seq_no) || r.seq_no <= 0) return NextResponse.json({ ok: false, message: `순번이 올바르지 않습니다. (${r.store_code})` }, { status: 400 });
    }

    // ── DB upsert ─────────────────────────────────────────────────────────
    const supabase  = createClient(url, serviceKey);
    const now       = new Date().toISOString();
    const upsertRows = cleaned.map((r) => ({ ...r, updated_at: now }));

    const { error: upErr } = await supabase
      .from("store_map")
      .upsert(upsertRows, { onConflict: "store_code" });
    if (upErr) throw upErr;

    const newCodes = cleaned.map((r) => r.store_code);
    const { count: deletedCount, error: delErr } = await supabase
      .from("store_map")
      .delete({ count: "exact" })
      .not("store_code", "in", `(${newCodes.join(",")})`);
    if (delErr) throw delErr;

    // ── meta 저장 ─────────────────────────────────────────────────────────
    const fileName = r2Key.replace(SLOT_PREFIX, "");
    const meta = {
      fileName,
      uploadedAt: now,
      fileSize: buffer.length,
      ...(body.uploaderName ? { uploaderName: body.uploaderName } : {}),
    };
    await putR2Object(META_KEY, JSON.stringify(meta), "application/json");

    return NextResponse.json({ ok: true, count: upsertRows.length, skippedNoCar, deleted: deletedCount ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? String(e) }, { status: 500 });
  }
}
