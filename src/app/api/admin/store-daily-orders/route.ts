import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

type CargoRow = {
  id: string;
  support_excluded?: boolean;
  note?: string;
  car_no: string;
  seq_no: number;
  store_code: string;
  store_name: string;
  large_box: number;
  large_inner: number;
  large_other: number;
  large_day2l: number;
  large_nb2l: number;
  small_low: number;
  small_high: number;
  event: number;
  tobacco: number;
  certificate: number;
  cdc: number;
  pbox: number;
  standard_time: string;
  address: string;
};

type VehicleSnapshot = {
  fileName: string;
  productRows: unknown[];
  cargoRows: CargoRow[];
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
      return json(true, undefined, { orders: null, noData: true, fileName: null, uploadedAt: null });
    }

    const snapshot = JSON.parse(text) as VehicleSnapshot;
    const normCode = normalizeStoreCode(storeCode);
    const normName = normalizeStoreName(storeName);

    const matching = (snapshot.cargoRows ?? []).filter((row) => {
      if (storeCode && normalizeStoreCode(row.store_code) === normCode) return true;
      if (storeName && normalizeStoreName(row.store_name) === normName) return true;
      return false;
    });

    return json(true, undefined, {
      orders: matching,
      noData: false,
      fileName: snapshot.fileName ?? null,
      uploadedAt: snapshot.uploadedAt ?? null,
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
