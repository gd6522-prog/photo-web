import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { buildInventoryCheckRows, type WorkPartKey, WORK_PART_LABEL } from "@/lib/inventory-check-compute";

export const runtime = "nodejs";

const VALID_PARTS = Object.keys(WORK_PART_LABEL) as WorkPartKey[];

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const part = (req.nextUrl.searchParams.get("part") ?? "box_manual") as WorkPartKey;
  if (!VALID_PARTS.includes(part)) {
    return json(false, `유효하지 않은 작업파트: ${part}`, null, 400);
  }

  try {
    const rows = await buildInventoryCheckRows(part);
    return json(true, undefined, { part, label: WORK_PART_LABEL[part], rows });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
