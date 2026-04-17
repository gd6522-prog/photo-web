import { NextRequest } from "next/server";
import { getR2ObjectText, putR2Object, listR2Keys } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";
import { R2_CELLS_CACHE_KEY } from "../product-strategy-cells/route";

async function readCellsCache(): Promise<Record<string, string>> {
  const text = await getR2ObjectText(R2_CELLS_CACHE_KEY);
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, string>; } catch { return {}; }
}

export const runtime = "nodejs";

const R2_PREFIX = "separate";
const AGGREGATE_KEY = `${R2_PREFIX}/_aggregate.json`;

function validateDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function r2Key(date: string): string {
  return `${R2_PREFIX}/${date}/all.json`;
}

// 키 형식: "store_code|product_code"
type SeparateEntry = {
  store_code: string;
  store_name: string;
  product_code: string;
  product_name: string;
  qty: number;
  center_unit: number;
  done?: boolean;
};
type SeparateData = Record<string, SeparateEntry>;
type AggregateEntry = SeparateEntry & { date: string };
type AggregateData = Record<string, AggregateEntry>; // key: "date|store_code|product_code"

async function readAggregate(): Promise<AggregateData | null> {
  const text = await getR2ObjectText(AGGREGATE_KEY);
  if (!text) return null;
  try { return JSON.parse(text) as AggregateData; } catch { return null; }
}

// 집계 파일이 없으면 전체 날짜 파일을 읽어 재생성
async function buildAndSaveAggregate(): Promise<AggregateData> {
  const keys = await listR2Keys(R2_PREFIX + "/");
  const matched = keys
    .map((key) => {
      const m = key.match(/^separate\/(\d{4}-\d{2}-\d{2})\/all\.json$/);
      return m ? { key, date: m[1] } : null;
    })
    .filter(Boolean) as { key: string; date: string }[];

  const aggregate: AggregateData = {};
  await Promise.all(
    matched.map(async ({ key, date: d }) => {
      const text = await getR2ObjectText(key);
      if (!text) return;
      try {
        const data = JSON.parse(text) as SeparateData;
        for (const entry of Object.values(data)) {
          if ((entry.qty ?? 0) <= 0) continue;
          const aggKey = `${d}|${entry.store_code}|${entry.product_code}`;
          aggregate[aggKey] = { date: d, ...entry };
        }
      } catch { /* skip */ }
    }),
  );
  await putR2Object(AGGREGATE_KEY, JSON.stringify(aggregate), "application/json");
  return aggregate;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all");
  const date = searchParams.get("date");

  if (all === "1") {
    const rebuild = searchParams.get("rebuild") === "1";
    if (rebuild) {
      // 수동 재생성 요청 — 전체 날짜 파일 스캔 + 셀 캐시 병렬 읽기
      const [aggregate, cells] = await Promise.all([buildAndSaveAggregate(), readCellsCache()]);
      const results = Object.values(aggregate);
      results.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.store_code !== b.store_code) return a.store_code.localeCompare(b.store_code);
        return a.product_name.localeCompare(b.product_name, "ko");
      });
      return json(true, undefined, { entries: results, cells, rebuilt: true });
    }

    // 집계 파일 + 셀 캐시 병렬 읽기 (1 round-trip)
    const [aggregate, cells] = await Promise.all([readAggregate(), readCellsCache()]);
    if (!aggregate) {
      // 집계 없음 → 백그라운드 재생성 트리거 후 즉시 빈 배열 반환 (클라이언트가 재요청)
      void buildAndSaveAggregate();
      return json(true, undefined, { entries: [], cells, needsRebuild: true });
    }

    const results = Object.values(aggregate);
    results.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.store_code !== b.store_code) return a.store_code.localeCompare(b.store_code);
      return a.product_name.localeCompare(b.product_name, "ko");
    });
    return json(true, undefined, { entries: results, cells });
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
    store_code?: string;
    store_name?: string;
    product_code?: string;
    product_name?: string;
    qty?: number;
    center_unit?: number;
    done?: boolean;
  };
  const { date, store_code, store_name, product_code, product_name, qty, center_unit, done } = body;

  if (!date || !validateDate(date)) return json(false, "date 필드가 필요합니다 (YYYY-MM-DD)", null, 400);
  if (!store_code) return json(false, "store_code 필드가 필요합니다", null, 400);
  if (!product_code) return json(false, "product_code 필드가 필요합니다", null, 400);

  const entryKey = `${store_code}|${product_code}`;
  const key = r2Key(date);
  const existing = await getR2ObjectText(key);
  const data: SeparateData = existing ? (JSON.parse(existing) as SeparateData) : {};

  const aggKey = `${date}|${store_code}|${product_code}`;

  // done 전용 업데이트: qty 없이 done만 전달된 경우
  if (typeof done === "boolean" && typeof qty === "undefined") {
    if (data[entryKey]) {
      data[entryKey] = { ...data[entryKey], done };
      const agg = (await readAggregate()) ?? {};
      if (agg[aggKey]) agg[aggKey] = { ...agg[aggKey], done };
      await Promise.all([
        putR2Object(key, JSON.stringify(data), "application/json"),
        putR2Object(AGGREGATE_KEY, JSON.stringify(agg), "application/json"),
      ]);
    }
    return json(true, undefined, { date, key: entryKey, done });
  }

  const numQty = typeof qty === "number" ? Math.max(0, Math.floor(qty)) : 0;

  if (numQty === 0) {
    delete data[entryKey];
  } else {
    data[entryKey] = {
      store_code: store_code ?? "",
      store_name: store_name ?? "",
      product_code: product_code ?? "",
      product_name: product_name ?? "",
      qty: numQty,
      center_unit: typeof center_unit === "number" ? center_unit : 0,
      ...(typeof done === "boolean" ? { done } : {}),
    };
  }

  const agg = (await readAggregate()) ?? {};
  if (numQty === 0) {
    delete agg[aggKey];
  } else {
    agg[aggKey] = { date, ...data[entryKey] };
  }
  await Promise.all([
    putR2Object(key, JSON.stringify(data), "application/json"),
    putR2Object(AGGREGATE_KEY, JSON.stringify(agg), "application/json"),
  ]);

  return json(true, undefined, { date, key: entryKey, qty: numQty });
}
