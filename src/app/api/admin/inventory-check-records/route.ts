import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const part = req.nextUrl.searchParams.get("part") ?? "";

  try {
    let q = guard.sbAdmin.from("inventory_check_records").select("*").order("saved_at", { ascending: false });
    if (part) q = q.eq("work_part", part);
    const { data, error } = await q;
    if (error) return json(false, error.message, null, 500);
    return json(true, undefined, { records: data ?? [] });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

type SavePayload = {
  part: string;
  rows: Array<{
    product_code: string;
    expiry_date: string;
    product_name: string;
    picking_cell: string;
    box_unit: number;
    picking_unit: number;
    computed_qty: number;
    box_count: number;
    unit_count: number;
    unit_cost: number;
    actual_expiry_date: string;
    actual_box_count: number;
    actual_unit_count: number;
  }>;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => null)) as SavePayload | null;
  if (!body || !Array.isArray(body.rows)) {
    return json(false, "rows 배열이 필요합니다.", null, 400);
  }
  if (!body.part) return json(false, "part 가 필요합니다.", null, 400);

  const now = new Date().toISOString();
  const records = body.rows.map((r) => ({
    product_code: String(r.product_code),
    expiry_date: String(r.expiry_date ?? ""),
    work_part: body.part,
    saved_at: now,
    computed_qty: Number(r.computed_qty) || 0,
    box_count: Number(r.box_count) || 0,
    unit_count: Number(r.unit_count) || 0,
    box_unit: Number(r.box_unit) || 0,
    picking_unit: Number(r.picking_unit) || 0,
    unit_cost: Number(r.unit_cost) || 0,
    product_name: String(r.product_name ?? ""),
    picking_cell: String(r.picking_cell ?? ""),
    actual_expiry_date: String(r.actual_expiry_date ?? ""),
    actual_box_count: Number(r.actual_box_count) || 0,
    actual_unit_count: Number(r.actual_unit_count) || 0,
  }));

  try {
    const { error } = await guard.sbAdmin
      .from("inventory_check_records")
      .upsert(records, { onConflict: "product_code,expiry_date" });
    if (error) return json(false, error.message, null, 500);
    return json(true, undefined, { saved: records.length, saved_at: now });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const part = req.nextUrl.searchParams.get("part") ?? "";

  try {
    let q = guard.sbAdmin.from("inventory_check_records").delete();
    if (part) q = q.eq("work_part", part);
    else q = q.neq("id", "00000000-0000-0000-0000-000000000000"); // 전체 삭제 보호용 더미 조건
    const { error } = await q;
    if (error) return json(false, error.message, null, 500);
    return json(true);
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
