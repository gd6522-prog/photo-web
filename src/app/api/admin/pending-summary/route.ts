import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const sb = guard.sbAdmin;
  const today = new Date().toISOString().slice(0, 10);

  const [hazardReportsCountRes, hazardResolvedCountRes, hazardPendingCountRes, redeliveryPhotosRes, redeliveryDoneRes] = await Promise.all([
    sb.from("hazard_reports").select("id", { count: "exact", head: true }),
    sb.from("hazard_report_resolutions").select("report_id", { count: "exact", head: true }).not("after_public_url", "is", null),
    sb.from("hazard_report_resolutions").select("report_id", { count: "exact", head: true }).is("after_public_url", null).gte("planned_due_date", today),
    sb.from("delivery_photos").select("id").ilike("path", "miochul/%").ilike("memo", "%재배송%"),
    sb.from("delivery_redelivery_done").select("photo_id"),
  ]);

  if (hazardReportsCountRes.error) return json(false, hazardReportsCountRes.error.message, null, 500);
  if (hazardResolvedCountRes.error) return json(false, hazardResolvedCountRes.error.message, null, 500);
  if (hazardPendingCountRes.error) return json(false, hazardPendingCountRes.error.message, null, 500);
  if (redeliveryPhotosRes.error) return json(false, redeliveryPhotosRes.error.message, null, 500);
  if (redeliveryDoneRes.error) return json(false, redeliveryDoneRes.error.message, null, 500);

  const pendingHazardCount = Math.max(0, (hazardReportsCountRes.count ?? 0) - (hazardResolvedCountRes.count ?? 0) - (hazardPendingCountRes.count ?? 0));

  const redeliveryIds = (redeliveryPhotosRes.data ?? []).map((r: { id: string }) => r.id);
  const redeliveryDoneSet = new Set((redeliveryDoneRes.data ?? []).map((r: { photo_id: string }) => r.photo_id));
  const pendingRedeliveryCount = redeliveryIds.filter((id) => !redeliveryDoneSet.has(id)).length;

  return json(true, undefined, {
    pendingHazardCount,
    hazardWaitingCount: hazardPendingCountRes.count ?? 0,
    pendingRedeliveryCount,
  });
}
