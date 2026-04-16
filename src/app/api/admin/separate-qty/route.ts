import { NextRequest } from "next/server";
import { getR2ObjectText, putR2Object, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";

export const runtime = "nodejs";

const R2_PREFIX = "separate";

function validateDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function r2Key(date: string): string {
  return `${R2_PREFIX}/${date}/all.json`;
}

type SeparateEntry = { product_name: string; qty: number };
type SeparateData = Record<string, SeparateEntry>;

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all");
  const date = searchParams.get("date");

  if (all === "1") {
    const keys = await listR2Keys(R2_PREFIX + "/");
    const results: Array<{ date: string; product_code: string; product_name: string; qty: number }> = [];

    for (const key of keys) {
      const dateMatch = key.match(/^separate\/(\d{4}-\d{2}-\d{2})\/all\.json$/);
      if (!dateMatch) continue;
      const d = dateMatch[1];
      const text = await getR2ObjectText(key);
      if (!text) continue;
      try {
        const data = JSON.parse(text) as SeparateData;
        for (const [product_code, entry] of Object.entries(data)) {
          if ((entry.qty ?? 0) > 0) {
            results.push({ date: d, product_code, product_name: entry.product_name ?? "", qty: entry.qty });
          }
        }
      } catch {
        // skip malformed
      }
    }

    results.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.product_name.localeCompare(b.product_name, "ko");
    });

    return json(true, undefined, { entries: results });
  }

  if (!date || !validateDate(date)) {
    return json(false, "date 파라미터가 필요합니다 (YYYY-MM-DD)", null, 400);
  }

  const text = await getR2ObjectText(r2Key(date));
  const data: SeparateData = text ? (JSON.parse(text) as SeparateData) : {};
  return json(true, undefined, { date, data });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => ({}))) as {
    date?: string;
    product_code?: string;
    product_name?: string;
    qty?: number;
  };
  const { date, product_code, product_name, qty } = body;

  if (!date || !validateDate(date)) return json(false, "date 필드가 필요합니다 (YYYY-MM-DD)", null, 400);
  if (!product_code) return json(false, "product_code 필드가 필요합니다", null, 400);

  const key = r2Key(date);
  const existing = await getR2ObjectText(key);
  const data: SeparateData = existing ? (JSON.parse(existing) as SeparateData) : {};

  const numQty = typeof qty === "number" ? Math.max(0, Math.floor(qty)) : 0;

  if (numQty === 0) {
    delete data[product_code];
  } else {
    data[product_code] = { product_name: product_name ?? "", qty: numQty };
  }

  await putR2Object(key, JSON.stringify(data), "application/json");
  return json(true, undefined, { date, product_code, qty: numQty });
}
