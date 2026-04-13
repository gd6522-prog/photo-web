import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { listR2Keys, getR2ObjectText, putR2Object } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

const SNAPSHOT_PREFIX = "vehicle-data/snapshots/";
const DAILY_PREFIX = "vehicle-data/daily/";
const BATCH_SIZE = 5; // 1회당 처리할 스냅샷 수

type ProductRow = {
  delivery_date: string;
  store_code: string;
  store_name: string;
  product_code: string;
  product_name: string;
  work_type: string;
  original_qty: number;
  current_qty: number;
  assigned_qty: number;
  confirmed_qty: number;
  center_unit: number;
  [key: string]: unknown;
};

type VehicleSnapshot = {
  fileName: string;
  productRows: ProductRow[];
  cargoRows: unknown[];
  uploadedAt: string;
  uploadedBy: string;
};

function normDeliveryDate(v: string): string {
  const s = String(v ?? "").trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return "";
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const body = (await req.json().catch(() => ({}))) as { offset?: number; overwrite?: boolean };
    const offset = Math.max(0, body.offset ?? 0);
    const overwrite = body.overwrite ?? false;

    // 전체 스냅샷 목록 (오래된 순)
    const allSnapKeys = (await listR2Keys(SNAPSHOT_PREFIX))
      .filter((k) => k.endsWith(".json"))
      .sort(); // 파일명 = 타임스탬프 → 정렬하면 오래된 것 먼저

    const batch = allSnapKeys.slice(offset, offset + BATCH_SIZE);
    if (batch.length === 0) {
      return json(true, undefined, { done: true, total: allSnapKeys.length, offset });
    }

    // 이미 존재하는 daily 파일 날짜 목록
    const existingDailyKeys = await listR2Keys(DAILY_PREFIX);
    const existingDates = new Set(
      existingDailyKeys
        .map((k) => k.replace(DAILY_PREFIX, "").replace(".json", ""))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    );

    // 납품예정일 → 최신 스냅샷 데이터 맵
    const dateToSnap = new Map<string, VehicleSnapshot>();

    for (const key of batch) {
      try {
        const text = await getR2ObjectText(key);
        if (!text) continue;

        const snapshot = JSON.parse(text) as VehicleSnapshot;
        const rows = snapshot.productRows ?? [];

        // 이 스냅샷에 있는 납품예정일들 수집
        const datesInSnap = new Set<string>();
        for (const row of rows) {
          const dd = normDeliveryDate(row.delivery_date);
          if (dd) datesInSnap.add(dd);
        }

        for (const dd of datesInSnap) {
          // overwrite=false면 이미 있는 날짜는 건너뜀
          if (!overwrite && existingDates.has(dd)) continue;

          const rowsForDate = rows.filter((r) => normDeliveryDate(r.delivery_date) === dd);
          // 같은 날짜에 대해 여러 스냅샷이 있으면 최신 것(나중에 처리된 것)으로 덮어씀
          const existing = dateToSnap.get(dd);
          if (!existing || (snapshot.uploadedAt ?? "") >= (existing.uploadedAt ?? "")) {
            dateToSnap.set(dd, { ...snapshot, productRows: rowsForDate });
          }
        }
      } catch {
        // 개별 스냅샷 실패는 무시하고 계속
      }
    }

    // daily 파일 저장
    const created: string[] = [];
    for (const [dd, snap] of dateToSnap) {
      await putR2Object(`${DAILY_PREFIX}${dd}.json`, JSON.stringify(snap), "application/json");
      created.push(dd);
    }

    const nextOffset = offset + BATCH_SIZE;
    const done = nextOffset >= allSnapKeys.length;

    return json(true, undefined, {
      done,
      total: allSnapKeys.length,
      processed: batch.length,
      offset,
      nextOffset: done ? null : nextOffset,
      created: created.sort(),
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
