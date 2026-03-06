import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const sb = guard.sbAdmin;

  const [hazardReportsRes, hazardResolutionsRes, redeliveryPhotosRes, redeliveryDoneRes] = await Promise.all([
    sb.from("hazard_reports").select("id"),
    sb.from("hazard_report_resolutions").select("report_id, after_public_url"),
    sb.from("delivery_photos").select("id").ilike("path", "miochul/%").ilike("memo", "%재배송%"),
    sb.from("delivery_redelivery_done").select("photo_id"),
  ]);

  if (hazardReportsRes.error) return json(false, hazardReportsRes.error.message, null, 500);
  if (hazardResolutionsRes.error) return json(false, hazardResolutionsRes.error.message, null, 500);
  if (redeliveryPhotosRes.error) return json(false, redeliveryPhotosRes.error.message, null, 500);
  if (redeliveryDoneRes.error) return json(false, redeliveryDoneRes.error.message, null, 500);

  const hazardIds = (hazardReportsRes.data ?? []).map((r: { id: string }) => r.id);
  const hazardDoneSet = new Set(
    (hazardResolutionsRes.data ?? [])
      .filter((r: { report_id: string; after_public_url: string | null }) => !!r.after_public_url)
      .map((r: { report_id: string }) => r.report_id)
  );
  const pendingHazardCount = hazardIds.filter((id) => !hazardDoneSet.has(id)).length;

  const redeliveryIds = (redeliveryPhotosRes.data ?? []).map((r: { id: string }) => r.id);
  const redeliveryDoneSet = new Set((redeliveryDoneRes.data ?? []).map((r: { photo_id: string }) => r.photo_id));
  const pendingRedeliveryCount = redeliveryIds.filter((id) => !redeliveryDoneSet.has(id)).length;

  return json(true, undefined, {
    pendingHazardCount,
    pendingRedeliveryCount,
  });
}
