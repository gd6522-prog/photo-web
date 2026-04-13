import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return json(true, undefined, { stores: [] });

  const sb = guard.sbAdmin;

  const { data: mapData, error: mapErr } = await sb
    .from("store_map")
    .select("store_code, store_name, car_no, seq_no, delivery_due_time, address")
    .or(`store_code.ilike.%${q}%,store_name.ilike.%${q}%`)
    .order("store_name", { ascending: true })
    .limit(30);

  if (mapErr) return json(false, mapErr.message, null, 500);

  const stores = (mapData ?? []) as Array<{
    store_code: string;
    store_name: string;
    car_no: string;
    seq_no: number;
    delivery_due_time: string | null;
    address: string | null;
  }>;

  if (stores.length === 0) return json(true, undefined, { stores: [] });

  const storeCodes = [...new Set(stores.map((s) => s.store_code).filter(Boolean))];
  const storeNames = [...new Set(stores.map((s) => s.store_name).filter(Boolean))];

  // .or() 대신 .in() 사용 — 점포명에 특수문자/공백 포함 시 .or() 필터 문자열이 깨지는 버그 방지
  let contactData: Array<{ store_code: string | null; store_name: string; phone: string; memo: string | null }> = [];

  if (storeCodes.length > 0) {
    const { data } = await sb
      .from("store_contacts")
      .select("store_code, store_name, phone, memo")
      .in("store_code", storeCodes);
    contactData.push(...((data ?? []) as typeof contactData));
  }

  if (storeNames.length > 0) {
    const { data } = await sb
      .from("store_contacts")
      .select("store_code, store_name, phone, memo")
      .in("store_name", storeNames);
    // store_code 쿼리에서 이미 가져온 항목은 중복 추가 방지
    const existingNames = new Set(contactData.map((c) => c.store_name));
    for (const row of (data ?? []) as typeof contactData) {
      if (!existingNames.has(row.store_name)) contactData.push(row);
    }
  }

  const contactByCode = new Map<string, (typeof contactData)[0]>();
  const contactByName = new Map<string, (typeof contactData)[0]>();
  for (const c of contactData) {
    if (c.store_code) contactByCode.set(c.store_code, c);
    contactByName.set(c.store_name, c);
  }

  const result = stores.map((s) => {
    const contact = contactByCode.get(s.store_code) ?? contactByName.get(s.store_name) ?? null;
    return {
      ...s,
      phone: contact?.phone ?? null,
      phone_memo: contact?.memo ?? null,
    };
  });

  return json(true, undefined, { stores: result });
}
