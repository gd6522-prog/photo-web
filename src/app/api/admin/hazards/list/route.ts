import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";

export const runtime = "nodejs";

type ReportRow = {
  id: string;
  user_id: string;
  comment: string | null;
  photo_path: string;
  photo_url: string;
  created_at: string;
};

type ResolutionRow = {
  report_id: string;
  after_path: string | null;
  after_public_url: string | null;
  after_memo: string | null;
  improved_by: string | null;
  improved_at: string | null;
  planned_due_date: string | null;
};

type ExtraPhotoRow = {
  id: string;
  report_id: string;
  photo_path: string | null;
  photo_url: string | null;
  created_at: string;
};

type HazardListItem = ReportRow & {
  creator_name: string | null;
  improver_name: string | null;
  resolution: ResolutionRow | null;
  extra_photos: ExtraPhotoRow[];
};

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const page = Math.max(1, toInt(req.nextUrl.searchParams.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, toInt(req.nextUrl.searchParams.get("pageSize"), 10)));
  const includeSummary = req.nextUrl.searchParams.get("includeSummary") !== "0";
  const today = new Date().toISOString().slice(0, 10);

  const { data: reportsData, count, error: reportsErr } = await guard.sbAdmin
    .from("hazard_reports")
    .select("id,user_id,comment,photo_path,photo_url,created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (reportsErr) return json(false, reportsErr.message, null, 500);

  const reports = (reportsData ?? []) as ReportRow[];
  const reportIds = reports.map((r) => r.id);

  let resolutions: ResolutionRow[] = [];
  let extraPhotos: ExtraPhotoRow[] = [];
  if (reportIds.length > 0) {
    const { data: resData, error: resErr } = await guard.sbAdmin
      .from("hazard_report_resolutions")
      .select("report_id,after_path,after_public_url,after_memo,improved_by,improved_at,planned_due_date")
      .in("report_id", reportIds);
    if (resErr) return json(false, resErr.message, null, 500);
    resolutions = (resData ?? []) as ResolutionRow[];

    const { data: extraData, error: extraErr } = await guard.sbAdmin
      .from("hazard_report_photos")
      .select("id,report_id,photo_path,photo_url,created_at")
      .in("report_id", reportIds)
      .order("created_at", { ascending: false });
    if (extraErr) return json(false, extraErr.message, null, 500);
    extraPhotos = (extraData ?? []) as ExtraPhotoRow[];
  }

  const resMap: Record<string, ResolutionRow> = {};
  for (const r of resolutions) resMap[r.report_id] = r;
  const extraPhotoMap: Record<string, ExtraPhotoRow[]> = {};
  for (const photo of extraPhotos) {
    if (!extraPhotoMap[photo.report_id]) extraPhotoMap[photo.report_id] = [];
    extraPhotoMap[photo.report_id].push(photo);
  }

  const userIds = Array.from(
    new Set(
      reports
        .flatMap((r) => [r.user_id, resMap[r.id]?.improved_by ?? null])
        .filter((v): v is string => !!v)
    )
  );

  let nameMap: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesErr } = await guard.sbAdmin.from("profiles").select("id,name").in("id", userIds);
    if (!profilesErr) {
      const map: Record<string, string | null> = {};
      for (const p of profilesData ?? []) map[(p as { id: string }).id] = (p as { name: string | null }).name;
      nameMap = map;
    }
  }

  const items = reports.map((r) => {
    const resolution = resMap[r.id] ?? null;
    return {
      ...r,
      creator_name: nameMap[r.user_id] ?? null,
      resolution,
      improver_name: resolution?.improved_by ? nameMap[resolution.improved_by] ?? null : null,
      extra_photos: extraPhotoMap[r.id] ?? [],
    } satisfies HazardListItem;
  });

  const statusOrder = { open: 0, pending: 1, done: 2 } as const;
  const getStatusKey = (resolution: ResolutionRow | null) => {
    if (resolution?.after_public_url) return "done" as const;
    if (resolution?.planned_due_date && resolution.planned_due_date >= today) return "pending" as const;
    return "open" as const;
  };

  const sortedItems = [...items].sort((a, b) => {
    const aStatus = getStatusKey(a.resolution);
    const bStatus = getStatusKey(b.resolution);
    if (aStatus !== bStatus) return statusOrder[aStatus] - statusOrder[bStatus];

    if (aStatus === "done" && bStatus === "done") {
      const aImprovedAt = new Date(a.resolution?.improved_at ?? "").getTime();
      const bImprovedAt = new Date(b.resolution?.improved_at ?? "").getTime();
      const aHasImprovedAt = Number.isFinite(aImprovedAt);
      const bHasImprovedAt = Number.isFinite(bImprovedAt);
      if (aHasImprovedAt && bHasImprovedAt && aImprovedAt !== bImprovedAt) {
        return bImprovedAt - aImprovedAt;
      }
      if (aHasImprovedAt !== bHasImprovedAt) {
        return aHasImprovedAt ? -1 : 1;
      }
    }

    const at = new Date(a.created_at).getTime();
    const bt = new Date(b.created_at).getTime();
    return bt - at;
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const pagedItems = sortedItems.slice(from, to);

  let totalCount: number | null = null;
  let unresolvedTotalCount: number | null = null;
  let pendingTotalCount: number | null = null;
  let resolvedTotalCount: number | null = null;
  if (includeSummary) {
    totalCount = sortedItems.length;
    unresolvedTotalCount = sortedItems.reduce((sum, item) => sum + (getStatusKey(item.resolution) === "open" ? 1 : 0), 0);
    pendingTotalCount = sortedItems.reduce((sum, item) => sum + (getStatusKey(item.resolution) === "pending" ? 1 : 0), 0);
    resolvedTotalCount = sortedItems.reduce((sum, item) => sum + (getStatusKey(item.resolution) === "done" ? 1 : 0), 0);
  }

  return json(true, undefined, {
    items: pagedItems,
    totalCount,
    unresolvedTotalCount,
    pendingTotalCount,
    resolvedTotalCount,
    page,
    pageSize,
    includeSummary,
  });
}
