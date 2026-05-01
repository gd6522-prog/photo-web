import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { computeChecklistCounts } from "@/lib/operation-checklist-compute";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const { counts, sources, diagnostic } = await computeChecklistCounts();
    return json(true, undefined, { counts, sources, diagnostic });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
