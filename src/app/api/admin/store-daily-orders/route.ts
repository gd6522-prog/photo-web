import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

type ProductRow = {
  delivery_date: string;
  car_no: string;
  seq_no: number;
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

function normalizeStoreName(v: string) {
  return String(v ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeStoreCode(v: string) {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw.toLowerCase();
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function qtyBase(row: ProductRow): number {
  const assigned = row.assigned_qty || row.confirmed_qty || row.current_qty || row.original_qty || 0;
  if (assigned <= 0) return 0;
  if (row.center_unit > 0) return assigned / row.center_unit;
  return assigned;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";
  const storeCode = req.nextUrl.searchParams.get("store_code")?.trim() ?? "";
  const storeName = req.nextUrl.searchParams.get("store_name")?.trim() ?? "";

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(false, "date 파라미터가 필요합니다. (YYYY-MM-DD)", null, 400);
  }
  if (!storeCode && !storeName) {
    return json(false, "store_code 또는 store_name이 필요합니다.", null, 400);
  }

  try {
    const text = await getR2ObjectText(`vehicle-data/daily/${date}.json`);
    if (!text) {
      return json(true, undefined, { products: null, noData: true, fileName: null, uploadedAt: null });
    }

    const snapshot = JSON.parse(text) as VehicleSnapshot;
    const normCode = normalizeStoreCode(storeCode);
    const normName = normalizeStoreName(storeName);

    const matching = (snapshot.productRows ?? []).filter((row) => {
      if (storeCode && normalizeStoreCode(row.store_code) === normCode) return true;
      if (storeName && normalizeStoreName(row.store_name) === normName) return true;
      return false;
    });

    const products = matching.map((row) => ({
      product_code: row.product_code,
      product_name: row.product_name,
      work_type: row.work_type,
      qty: qtyBase(row),
      delivery_date: row.delivery_date,
    }));

    return json(true, undefined, {
      products,
      noData: false,
      fileName: snapshot.fileName ?? null,
      uploadedAt: snapshot.uploadedAt ?? null,
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
