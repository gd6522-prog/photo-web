// supabase/functions/sync-holidays/index.ts
/// <reference lib="deno.ns" />

import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type HolidayItem = { date: string; name: string };

type BodyPayload = {
  year?: number;
  yearFrom?: number;
  yearTo?: number;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function ymdFromLocdate(locdate: string): string {
  // "20260217" -> "2026-02-17"
  const y = locdate.slice(0, 4);
  const m = locdate.slice(4, 6);
  const d = locdate.slice(6, 8);
  return `${y}-${m}-${d}`;
}

// <item><locdate>20260217</locdate><dateName>설날</dateName><isHoliday>Y</isHoliday>...</item>
function parseRestDeInfoXml(xml: string): HolidayItem[] {
  const items: HolidayItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;

  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];

    const loc = /<locdate>(\d{8})<\/locdate>/.exec(block)?.[1];
    const name = /<dateName>([\s\S]*?)<\/dateName>/.exec(block)?.[1]?.trim();
    const isHoliday = /<isHoliday>(Y|N)<\/isHoliday>/.exec(block)?.[1];

    if (!loc || !name) continue;
    if (isHoliday && isHoliday !== "Y") continue;

    items.push({ date: ymdFromLocdate(loc), name });
  }

  return items;
}

async function fetchMonth(serviceKey: string, year: number, month: number): Promise<HolidayItem[]> {
  const mm = String(month).padStart(2, "0");

  const url = new URL(
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo",
  );
  url.searchParams.set("ServiceKey", serviceKey); // 공공데이터포털 Decoding 키
  url.searchParams.set("solYear", String(year));
  url.searchParams.set("solMonth", mm);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");

  const res = await fetch(url.toString());
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Holiday API failed: ${res.status} ${text.slice(0, 300)}`);
  }

  return parseRestDeInfoXml(text);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

async function readBody(req: Request): Promise<BodyPayload> {
  try {
    const json: unknown = await req.json();
    if (!isRecord(json)) return {};

    const year = toNumber(json.year);
    const yearFrom = toNumber(json.yearFrom);
    const yearTo = toNumber(json.yearTo);

    return { year, yearFrom, yearTo };
  } catch {
    return {};
  }
}

serve(async (req: Request) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ invoke(로그인 상태)면 Authorization이 자동으로 들어옴
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const DATA_GO_KR_SERVICE_KEY = requireEnv("DATA_GO_KR_SERVICE_KEY");

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // { year: 2026 } 또는 { yearFrom: 2025, yearTo: 2027 }
    const body = await readBody(req);

    let fromY: number;
    let toY: number;

    if (typeof body.year === "number") {
      fromY = body.year;
      toY = body.year;
    } else {
      fromY = typeof body.yearFrom === "number" ? body.yearFrom : new Date().getFullYear();
      toY = typeof body.yearTo === "number" ? body.yearTo : fromY + 1; // 기본: 올해~내년
    }

    const all: HolidayItem[] = [];
    for (let y = fromY; y <= toY; y++) {
      for (let m = 1; m <= 12; m++) {
        const list = await fetchMonth(DATA_GO_KR_SERVICE_KEY, y, m);
        all.push(...list);
      }
    }

    // date 기준 중복 제거
    const uniq = new Map<string, HolidayItem>();
    for (const it of all) uniq.set(it.date, it);

    const rows = Array.from(uniq.values()).map((x) => ({
      date: x.date,
      name: x.name,
      source: "data.go.kr",
    }));

    const { error } = await adminClient.from("holidays").upsert(rows, { onConflict: "date" });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, upserted: rows.length, fromY, toY }), {
      headers: corsHeaders,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});