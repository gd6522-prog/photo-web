import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";

export const runtime = "nodejs";

type HazardResolutionRow = {
  report_id: string;
  after_public_url: string | null;
  planned_due_date: string | null;
  improved_at: string | null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const sb = guard.sbAdmin;
  const today = new Date().toISOString().slice(0, 10);

  const [hazardReportsRes, hazardResolutionsRes, redeliveryPhotosRes, redeliveryDoneRes] = await Promise.all([
    sb.from("hazard_reports").select("id"),
    sb.from("hazard_report_resolutions").select("report_id, after_public_url, planned_due_date, improved_at"),
    sb.from("delivery_photos").select("id").ilike("path", "miochul/%").ilike("memo", "%?щ같??"),
    sb.from("delivery_redelivery_done").select("photo_id"),
  ]);

  if (hazardReportsRes.error) return json(false, hazardReportsRes.error.message, null, 500);
  if (hazardResolutionsRes.error) return json(false, hazardResolutionsRes.error.message, null, 500);
  if (redeliveryPhotosRes.error) return json(false, redeliveryPhotosRes.error.message, null, 500);
  if (redeliveryDoneRes.error) return json(false, redeliveryDoneRes.error.message, null, 500);

  const latestResolutionByReportId = new Map<string, HazardResolutionRow>();
  for (const row of (hazardResolutionsRes.data ?? []) as HazardResolutionRow[]) {
    const existing = latestResolutionByReportId.get(row.report_id);
    if (!existing) {
      latestResolutionByReportId.set(row.report_id, row);
      continue;
    }

    const existingStamp = existing.improved_at ?? "";
    const nextStamp = row.improved_at ?? "";
    if (nextStamp >= existingStamp) {
      latestResolutionByReportId.set(row.report_id, row);
    }
  }

  let pendingHazardCount = 0;
  let hazardWaitingCount = 0;
  for (const report of (hazardReportsRes.data ?? []) as Array<{ id: string }>) {
    const resolution = latestResolutionByReportId.get(report.id);
    if (resolution?.after_public_url) continue;
    if (resolution?.planned_due_date && resolution.planned_due_date >= today) {
      hazardWaitingCount += 1;
      continue;
    }
    pendingHazardCount += 1;
  }

  const redeliveryIds = (redeliveryPhotosRes.data ?? []).map((r: { id: string }) => r.id);
  const redeliveryDoneSet = new Set((redeliveryDoneRes.data ?? []).map((r: { photo_id: string }) => r.photo_id));
  const pendingRedeliveryCount = redeliveryIds.filter((id) => !redeliveryDoneSet.has(id)).length;

  return json(true, undefined, {
    pendingHazardCount,
    hazardWaitingCount,
    pendingRedeliveryCount,
  });
}
