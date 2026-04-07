import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REASON_MAP: Record<string, { code: string; name: string }> = {
  파손:     { code: "81", name: "파손" },
  오발주:   { code: "82", name: "오발주" },
  재배송:   { code: "83", name: "재배송" },
  맞교환:   { code: "84", name: "맞교환" },
  긴급출고: { code: "85", name: "긴급출고" },
  회수:     { code: "86", name: "회수" },
};

function getReasonCode(reason: string): { code: string; name: string } {
  if (!reason) return { code: "82", name: "오발주" };
  for (const [key, val] of Object.entries(REASON_MAP)) {
    if (reason.includes(key)) return val;
  }
  return { code: "82", name: reason };
}

function toDateStr(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "number") {
    // Excel date serial
    const date = XLSX.SSF.parse_date_code(raw);
    const y = date.y;
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  // yyyy-mm-dd or yyyymmdd
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function makeBarcode(reasonCode: string, dateStr: string, storeCode: string): string {
  // {사유코드2}{년4}{월2}{일2}{점포코드(최대5자리)}
  const parts = dateStr.split("-");
  if (parts.length !== 3) return `${reasonCode}00000000${storeCode.slice(0, 5).padStart(5, "0")}`;
  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");
  const sc = String(storeCode).slice(0, 5).padStart(5, "0");
  return `${reasonCode}${y}${m}${d}${sc}`;
}

export async function POST(req: NextRequest) {
  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(
      req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
    );

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const monthLabel = (formData.get("monthLabel") as string) || "";

    if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    // RAW 시트 찾기
    const rawSheetName = wb.SheetNames.find((n) => n === "RAW") ?? wb.SheetNames[0];
    const ws = wb.Sheets[rawSheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

    // 헤더는 2행 (0-indexed: 0, 1) → 데이터는 3행부터
    // Col indices (row[1] 기준):
    // 0=창고코드 2=호차 3=순번 4=점포코드 5=점포명 6=납품예정일
    // 8=상품코드 9=상품명 11=입수 12=수량(배수) 13=낱개수량
    // 16=미오출수량 17=점포등록사유 18=센터등록사유

    type RawRow = {
      truckNo: number;
      seqNo: number;
      storeCode: string;
      storeName: string;
      deliveryDate: string;
      productCode: string;
      productName: string;
      innerQty: number;
      boxQty: number;
      returnQty: number;
      reason: string;
    };

    const dataRows: RawRow[] = [];

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 17) continue;

      const returnQty = Number(row[16]) || 0;
      if (returnQty === 0) continue;

      const reason = String(row[17] ?? row[18] ?? "").trim();
      if (!reason) continue;

      dataRows.push({
        truckNo:      Number(row[2]) || 0,
        seqNo:        Number(row[3]) || 0,
        storeCode:    String(row[4] ?? "").trim(),
        storeName:    String(row[5] ?? "").trim(),
        deliveryDate: toDateStr(row[6]),
        productCode:  String(row[8] ?? "").trim(),
        productName:  String(row[9] ?? "").trim(),
        innerQty:     Number(row[11]) || 0,
        boxQty:       Number(row[12]) || 0,
        returnQty,
        reason,
      });
    }

    if (dataRows.length === 0) {
      return NextResponse.json({ error: "미오출 데이터가 없습니다" }, { status: 400 });
    }

    // 배치 생성
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("insu_batches")
      .insert({
        upload_date:   new Date().toISOString().slice(0, 10),
        month_label:   monthLabel,
        file_name:     file.name,
        row_count:     dataRows.length,
        created_by:    user?.id ?? null,
      })
      .select("id")
      .single();

    if (batchErr || !batch) throw batchErr ?? new Error("배치 생성 실패");

    // 인수증 그룹핑: (deliveryDate, truckNo, seqNo, storeCode, reasonCode)
    type GroupKey = string;
    const groups = new Map<GroupKey, { meta: RawRow; items: RawRow[] }>();

    for (const row of dataRows) {
      const { code: reasonCode } = getReasonCode(row.reason);
      const key: GroupKey = `${row.deliveryDate}|${row.truckNo}|${row.seqNo}|${row.storeCode}|${reasonCode}`;
      if (!groups.has(key)) {
        groups.set(key, { meta: row, items: [] });
      }
      groups.get(key)!.items.push(row);
    }

    const groupEntries = Array.from(groups.entries());

    // 인수증 삽입
    const receiptInserts = groupEntries.map(([, { meta }], idx) => {
      const { code: reasonCode, name: reasonName } = getReasonCode(meta.reason);
      const barcode = makeBarcode(reasonCode, meta.deliveryDate, meta.storeCode);
      return {
        batch_id:      batch.id,
        receipt_no:    idx + 1,
        barcode,
        delivery_date: meta.deliveryDate,
        truck_no:      meta.truckNo,
        seq_no:        meta.seqNo,
        store_code:    meta.storeCode,
        store_name:    meta.storeName,
        reason_code:   reasonCode,
        reason_name:   reasonName,
        item_count:    0, // updated below
        is_returned:   false,
      };
    });

    const { data: receipts, error: recErr } = await supabaseAdmin
      .from("insu_receipts")
      .insert(receiptInserts)
      .select("id, barcode");

    if (recErr || !receipts) throw recErr ?? new Error("인수증 생성 실패");

    // barcode → id 매핑
    const barcodeToId = new Map<string, string>(receipts.map((r: { id: string; barcode: string }) => [r.barcode, r.id]));

    // 아이템 삽입
    const itemInserts: object[] = [];
    for (const [, { meta, items }] of groupEntries) {
      const { code: reasonCode } = getReasonCode(meta.reason);
      const barcode = makeBarcode(reasonCode, meta.deliveryDate, meta.storeCode);
      const receiptId = barcodeToId.get(barcode);
      if (!receiptId) continue;

      items.forEach((item, lineIdx) => {
        itemInserts.push({
          receipt_id:   receiptId,
          line_no:      lineIdx + 1,
          product_code: item.productCode,
          product_name: item.productName,
          inner_qty:    item.innerQty,
          return_qty:   item.returnQty,
          box_qty:      item.boxQty,
          location:     "",
        });
      });

      // item_count 업데이트
      await supabaseAdmin
        .from("insu_receipts")
        .update({ item_count: items.length })
        .eq("id", receiptId);
    }

    if (itemInserts.length > 0) {
      const { error: itemErr } = await supabaseAdmin.from("insu_items").insert(itemInserts);
      if (itemErr) throw itemErr;
    }

    // 배치 receipt_count 업데이트
    await supabaseAdmin
      .from("insu_batches")
      .update({ receipt_count: receiptInserts.length })
      .eq("id", batch.id);

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      rowCount: dataRows.length,
      receiptCount: receiptInserts.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
