import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getR2ObjectBuffer, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";

export const runtime = "nodejs";

// 입고현황 Excel 컬럼 위치 (EXCEL_COLNAMES 순서 기준, 2행 헤더 이후 데이터)
const COL = {
  inb_ect_date:     6,   // SHOW_INB_ECT_DATE  입고예정일자
  inb_date:         7,   // SHOW_INB_DATE      입고일자
  suppr_id:         11,  // SUPPR_ID           공급거래처코드
  suppr_nm:         12,  // SUPPR_NM           공급거래처명
  itemgrp_bnm:      14,  // ITEMGRP_BNM        대분류명
  item_cd:          15,  // ITEM_CD            상품코드
  item_nm:          16,  // ITEM_NM            상품명
  inb_status:       18,  // INB_DETL_SCD       입고상세상태
  shortage_status:  19,  // SHOW_SHORTAGE_SCD  결품상태
  ord_qty:          20,  // ORD_QTY            발주수량
  ord_price:        21,  // ORD_PRICE          발주금액
  inb_qty:          22,  // INB_QTY            입고수량
  inb_price:        23,  // INB_PRICE          입고금액
  miss_qty:         24,  // MISS_QTY           결품수량
  miss_price:       25,  // MISS_PRICE         결품금액
  valid_datetime:   26,  // VALID_DATETIME      소비기한
} as const;

export type InboundRow = {
  inb_ect_date: string;
  inb_date: string;
  suppr_id: string;
  suppr_nm: string;
  itemgrp_bnm: string;
  item_cd: string;
  item_nm: string;
  inb_status: string;
  shortage_status: string;
  ord_qty: number;
  ord_price: number;
  inb_qty: number;
  inb_price: number;
  miss_qty: number;
  miss_price: number;
  valid_datetime: string;
};

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const keys = await listR2Keys("file-uploads/inbound-status/");
  if (keys.length === 0) {
    return json(true, undefined, { rows: [], uploadedAt: null });
  }

  // 가장 최신 파일 사용
  const latestKey = [...keys].sort().reverse()[0];
  const buffer = await getR2ObjectBuffer(latestKey);
  if (!buffer) {
    return json(true, undefined, { rows: [], uploadedAt: null });
  }

  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return json(true, undefined, { rows: [], uploadedAt: null });

    // header:1 → 모든 행을 배열로 반환 (2행 헤더 포함)
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];

    // 헤더 2행 skip → 데이터는 index 2부터
    const HEADER_ROWS = 2;
    const rows: InboundRow[] = [];

    for (let i = HEADER_ROWS; i < raw.length; i++) {
      const r = raw[i];
      if (!r || r.every((c) => !c)) continue; // 빈 행 skip

      const item_cd = toStr(r[COL.item_cd]);
      if (!item_cd) continue; // 상품코드 없는 행 skip

      rows.push({
        inb_ect_date:    toStr(r[COL.inb_ect_date]),
        inb_date:        toStr(r[COL.inb_date]),
        suppr_id:        toStr(r[COL.suppr_id]),
        suppr_nm:        toStr(r[COL.suppr_nm]),
        itemgrp_bnm:     toStr(r[COL.itemgrp_bnm]),
        item_cd,
        item_nm:         toStr(r[COL.item_nm]),
        inb_status:      toStr(r[COL.inb_status]),
        shortage_status: toStr(r[COL.shortage_status]),
        ord_qty:         toNum(r[COL.ord_qty]),
        ord_price:       toNum(r[COL.ord_price]),
        inb_qty:         toNum(r[COL.inb_qty]),
        inb_price:       toNum(r[COL.inb_price]),
        miss_qty:        toNum(r[COL.miss_qty]),
        miss_price:      toNum(r[COL.miss_price]),
        valid_datetime:  toStr(r[COL.valid_datetime]),
      });
    }

    // 파일명에서 업로드 날짜 추출
    const fileNameMatch = latestKey.match(/_(\d{8})_(\d{6})/);
    const uploadedAt = fileNameMatch
      ? `${fileNameMatch[1].slice(0, 4)}-${fileNameMatch[1].slice(4, 6)}-${fileNameMatch[1].slice(6, 8)} ${fileNameMatch[2].slice(0, 2)}:${fileNameMatch[2].slice(2, 4)}:${fileNameMatch[2].slice(4, 6)}`
      : null;

    return json(true, undefined, { rows, uploadedAt });
  } catch {
    return json(false, "파일 파싱 오류", null, 500);
  }
}
