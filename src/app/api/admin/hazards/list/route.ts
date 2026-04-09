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
  sort_key: number;
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

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Phase 1: fix RPC + reports 병렬 실행 (fix는 summary 전에만 완료되면 됨)
  const [, reportsResult] = await Promise.all([
    guard.sbAdmin.rpc("fix_expired_hazard_sort_keys"),
    guard.sbAdmin
      .from("hazard_reports")
      .select("id,user_id,comment,photo_path,photo_url,created_at,sort_key", { count: "exact" })
      .order("sort_key", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to),
  ]);

  if (reportsResult.error) return json(false, reportsResult.error.message, null, 500);

  const reports = (reportsResult.data ?? []) as ReportRow[];
  const totalCount = reportsResult.count ?? 0;
  const reportIds = reports.map((r) => r.id);

  // Phase 2: summary + resolutions + extraPhotos + profiles 모두 병렬
  const reportUserIds = reports.map((r) => r.user_id);

  const [summaryResult, resResult, extraResult, profileResult] = await Promise.all([
    includeSummary
      ? guard.sbAdmin.rpc("get_hazard_summary")
      : Promise.resolve({ data: null, error: null }),
    reportIds.length > 0
      ? guard.sbAdmin
          .from("hazard_report_resolutions")
          .select("report_id,after_path,after_public_url,after_memo,improved_by,improved_at,planned_due_date")
          .in("report_id", reportIds)
      : Promise.resolve({ data: [], error: null }),
    reportIds.length > 0
      ? guard.sbAdmin
          .from("hazard_report_photos")
          .select("id,report_id,photo_path,photo_url,created_at")
          .in("report_id", reportIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    reportUserIds.length > 0
      ? guard.sbAdmin.from("profiles").select("id,name").in("id", reportUserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (resResult.error) return json(false, resResult.error.message, null, 500);
  if (extraResult.error) return json(false, extraResult.error.message, null, 500);

  type SummaryRow = { sort_key: number; cnt: number };
  const summaryRows = (summaryResult.data ?? []) as SummaryRow[];
  const unresolvedTotalCount = includeSummary ? (summaryRows.find((r) => r.sort_key === 0)?.cnt ?? 0) : null;
  const pendingTotalCount    = includeSummary ? (summaryRows.find((r) => r.sort_key === 1)?.cnt ?? 0) : null;
  const resolvedTotalCount   = includeSummary ? (summaryRows.find((r) => r.sort_key === 2)?.cnt ?? 0) : null;

  const resolutions = (resResult.data ?? []) as ResolutionRow[];
  const extraPhotos = (extraResult.data ?? []) as ExtraPhotoRow[];

  const resMap: Record<string, ResolutionRow> = {};
  for (const r of resolutions) resMap[r.report_id] = r;

  const extraPhotoMap: Record<string, ExtraPhotoRow[]> = {};
  for (const photo of extraPhotos) {
    if (!extraPhotoMap[photo.report_id]) extraPhotoMap[photo.report_id] = [];
    extraPhotoMap[photo.report_id].push(photo);
  }

  // improved_by 프로필은 첫 조회에서 없을 수 있으므로 추가 병합
  const nameMap: Record<string, string | null> = {};
  for (const p of (profileResult.data ?? []) as { id: string; name: string | null }[]) {
    nameMap[p.id] = p.name;
  }
  const missingIds = resolutions
    .map((r) => r.improved_by)
    .filter((v): v is string => !!v && !(v in nameMap));
  if (missingIds.length > 0) {
    const { data: extra } = await guard.sbAdmin.from("profiles").select("id,name").in("id", missingIds);
    for (const p of (extra ?? []) as { id: string; name: string | null }[]) nameMap[p.id] = p.name;
  }

  if (reportIds.length === 0) {
    return json(true, undefined, {
      items: [],
      totalCount,
      unresolvedTotalCount,
      pendingTotalCount,
      resolvedTotalCount,
      page,
      pageSize,
      includeSummary,
    });
  }

  const items: HazardListItem[] = reports.map((r) => {
    const resolution = resMap[r.id] ?? null;
    return {
      ...r,
      creator_name: nameMap[r.user_id] ?? null,
      resolution,
      improver_name: resolution?.improved_by ? (nameMap[resolution.improved_by] ?? null) : null,
      extra_photos: extraPhotoMap[r.id] ?? [],
    };
  });

  return json(true, undefined, {
    items,
    totalCount,
    unresolvedTotalCount,
    pendingTotalCount,
    resolvedTotalCount,
    page,
    pageSize,
    includeSummary,
  });
}
