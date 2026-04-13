import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { getR2ObjectText, listR2Keys } from "@/lib/r2";

export const runtime = "nodejs";

const DAILY_PREFIX = "vehicle-data/daily/";
const DEFAULT_DAYS = 60;
const HARD_MAX_DAYS = 365;
const BATCH_SIZE = 6;

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
};

type VehicleSnapshot = {
  fileName: string;
  productRows: ProductRow[];
  uploadedAt: string;
};

function normalizeStoreName(v: string) {
  return String(v ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeStoreCode(v: string) {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw.toLowerCase();
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function normalizeProductText(v: string) {
  return String(v ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeDeliveryDate(v: string): string {
  const s = String(v ?? "").trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return "";
}

function qtyBase(row: ProductRow): number {
  const assigned = row.assigned_qty || row.confirmed_qty || row.current_qty || row.original_qty || 0;
  if (assigned <= 0) return 0;
  if (row.center_unit > 0) return assigned / row.center_unit;
  return assigned;
}

async function scanDailyFile(
  key: string,
  normStoreCode: string,
  normStoreName: string,
  normQuery: string,
  storeCode: string,
  storeName: string,
): Promise<Array<{ date: string; product_code: string; product_name: string; work_type: string; qty: number }>> {
  const date = key.replace(DAILY_PREFIX, "").replace(".json", "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  try {
    const text = await getR2ObjectText(key);
    if (!text) return [];

    const snapshot = JSON.parse(text) as VehicleSnapshot;
    const results: Array<{ date: string; product_code: string; product_name: string; work_type: string; qty: number }> = [];

    for (const row of snapshot.productRows ?? []) {
      const codeMatch = storeCode && normalizeStoreCode(row.store_code) === normStoreCode;
      const nameMatch = storeName && normalizeStoreName(row.store_name) === normStoreName;
      if (!codeMatch && !nameMatch) continue;

      const codeQ = normalizeProductText(row.product_code).includes(normQuery);
      const nameQ = normalizeProductText(row.product_name).includes(normQuery);
      if (!codeQ && !nameQ) continue;

      const qty = qtyBase(row);
      if (qty <= 0) continue;

      // 파일명 날짜가 아닌 row 내의 납품예정일 사용
      const rowDate = normalizeDeliveryDate(row.delivery_date) || date;

      results.push({
        date: rowDate,
        product_code: row.product_code,
        product_name: row.product_name,
        work_type: row.work_type,
        qty,
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const storeCode = req.nextUrl.searchParams.get("store_code")?.trim() ?? "";
  const storeName = req.nextUrl.searchParams.get("store_name")?.trim() ?? "";
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0
    ? Math.min(daysParam, HARD_MAX_DAYS)
    : DEFAULT_DAYS;

  if (!storeCode && !storeName) {
    return json(false, "store_code 또는 store_name이 필요합니다.", null, 400);
  }
  if (!q || q.length < 2) {
    return json(false, "검색어는 2자 이상 입력해주세요.", null, 400);
  }

  try {
    const allKeys = await listR2Keys(DAILY_PREFIX);

    const dailyKeys = allKeys
      .filter((k) => /vehicle-data\/daily\/\d{4}-\d{2}-\d{2}\.json$/.test(k))
      .sort()
      .reverse()
      .slice(0, days);

    const normStoreCode = normalizeStoreCode(storeCode);
    const normStoreName = normalizeStoreName(storeName);
    const normQuery = normalizeProductText(q);

    const allResults: Array<{ date: string; product_code: string; product_name: string; work_type: string; qty: number }> = [];

    for (let i = 0; i < dailyKeys.length; i += BATCH_SIZE) {
      const batch = dailyKeys.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((key) => scanDailyFile(key, normStoreCode, normStoreName, normQuery, storeCode, storeName)),
      );
      for (const rows of batchResults) allResults.push(...rows);
    }

    // 날짜별로 같은 product_code+work_type을 합산
    const grouped = new Map<string, { date: string; product_code: string; product_name: string; work_type: string; qty: number }>();
    for (const r of allResults) {
      const key = `${r.date}__${r.product_code}__${r.work_type}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += r.qty;
      } else {
        grouped.set(key, { ...r });
      }
    }

    const history = [...grouped.values()].sort((a, b) => {
      // 1순위: 납품예정일 내림차순
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      // 2순위: 상품명 오름차순
      return a.product_name.localeCompare(b.product_name, "ko");
    });

    return json(true, undefined, { history, scanned: dailyKeys.length });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
