import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  if (!guard.isMainAdmin) return json(false, "Forbidden (main admin only)", null, 403);

  try {
    const body = (await req.json().catch(() => ({}))) as { reportId?: string };
    const reportId = String(body.reportId ?? "").trim();
    if (!reportId) return json(false, "reportId is required", null, 400);

    const { data: report, error: reportGetErr } = await guard.sbAdmin
      .from("hazard_reports")
      .select("id,photo_path")
      .eq("id", reportId)
      .maybeSingle();
    if (reportGetErr) return json(false, reportGetErr.message, null, 500);
    if (!report) return json(false, "Report not found", null, 404);

    const { data: resolution, error: resGetErr } = await guard.sbAdmin
      .from("hazard_report_resolutions")
      .select("report_id,after_path")
      .eq("report_id", reportId)
      .maybeSingle();
    if (resGetErr) return json(false, resGetErr.message, null, 500);

    const { error: resDelErr } = await guard.sbAdmin.from("hazard_report_resolutions").delete().eq("report_id", reportId);
    if (resDelErr) return json(false, resDelErr.message, null, 500);

    const { error: reportDelErr } = await guard.sbAdmin.from("hazard_reports").delete().eq("id", reportId);
    if (reportDelErr) return json(false, reportDelErr.message, null, 500);

    const removePaths = [report.photo_path, resolution?.after_path ?? null].filter((v): v is string => !!v);
    if (removePaths.length > 0) {
      // Ignore storage deletion failure to keep DB deletion authoritative.
      await guard.sbAdmin.storage.from("hazard-reports").remove(removePaths);
    }

    return json(true, "deleted", { reportId });
  } catch (e) {
    return json(false, (e as Error)?.message ?? "delete failed", null, 500);
  }
}

