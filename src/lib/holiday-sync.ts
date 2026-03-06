import { createClient } from "@supabase/supabase-js";

type HolidayItem = { date: string; name: string };

export type HolidaySyncResult = {
  fromY: number;
  toY: number;
  inserted: number;
  updated: number;
  upserted: number;
  skipped: number;
};

function ymdFromLocdate(locdate: string): string {
  return `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`;
}

function parseRestDeInfoXml(xml: string): HolidayItem[] {
  const out: HolidayItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;

  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const loc = /<locdate>(\d{8})<\/locdate>/.exec(block)?.[1];
    const name = /<dateName>([\s\S]*?)<\/dateName>/.exec(block)?.[1]?.trim();
    const isHoliday = /<isHoliday>(Y|N)<\/isHoliday>/.exec(block)?.[1];

    if (!loc || !name) continue;
    if (isHoliday && isHoliday !== "Y") continue;

    out.push({ date: ymdFromLocdate(loc), name });
  }

  return out;
}

async function fetchMonth(serviceKey: string, year: number, month: number): Promise<HolidayItem[]> {
  const mm = String(month).padStart(2, "0");
  const url = new URL("https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo");

  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("solYear", String(year));
  url.searchParams.set("solMonth", mm);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Holiday API failed: ${res.status} ${text.slice(0, 300)}`);
  }

  return parseRestDeInfoXml(text);
}

export function kstNowYear() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCFullYear();
}

export async function syncHolidaysRange(yearFrom: number, yearTo: number): Promise<HolidaySyncResult> {
  if (yearFrom > yearTo) throw new Error("yearFrom cannot be greater than yearTo.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dataGoKey = process.env.DATA_GO_KR_SERVICE_KEY;

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!dataGoKey) throw new Error("Missing DATA_GO_KR_SERVICE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const all: HolidayItem[] = [];
  for (let y = yearFrom; y <= yearTo; y++) {
    for (let m = 1; m <= 12; m++) {
      const list = await fetchMonth(dataGoKey, y, m);
      all.push(...list);
    }
  }

  const uniq = new Map<string, HolidayItem>();
  for (const h of all) uniq.set(h.date, h);

  const rows = Array.from(uniq.values()).map((x) => ({
    date: x.date,
    name: x.name,
    source: "data.go.kr",
  }));

  const { data: existing, error: selErr } = await admin
    .from("holidays")
    .select("date")
    .gte("date", `${yearFrom}-01-01`)
    .lte("date", `${yearTo}-12-31`);
  if (selErr) throw selErr;

  const existingSet = new Set((existing ?? []).map((r: { date: string }) => String(r.date)));
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    if (existingSet.has(r.date)) updated += 1;
    else inserted += 1;
  }

  const { error: upsertErr } = await admin.from("holidays").upsert(rows, { onConflict: "date" });
  if (upsertErr) throw upsertErr;

  return {
    fromY: yearFrom,
    toY: yearTo,
    inserted,
    updated,
    upserted: rows.length,
    skipped: 0,
  };
}
