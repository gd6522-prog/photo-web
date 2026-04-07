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

  // 만료된 처리대기 sort_key 교정 (summary 조회 전 완료 필요)
  await guard.sbAdmin.rpc("fix_expired_hazard_sort_keys");

  // Phase 1: 페이지 데이터 + 요약 카운트 병렬 조회
  const [reportsResult, summaryResult] = await Promise.all([
    guard.sbAdmin
      .from("hazard_reports")
      .select("id,user_id,comment,photo_path,photo_url,created_at,sort_key", { count: "exact" })
      .order("sort_key", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to),
    includeSummary
      ? guard.sbAdmin.rpc("get_hazard_summary")
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (reportsResult.error) return json(false, reportsResult.error.message, null, 500);

  const reports = (reportsResult.data ?? []) as ReportRow[];
  const totalCount = reportsResult.count ?? 0;
  const reportIds = reports.map((r) => r.id);

  type SummaryRow = { sort_key: number; cnt: number };
  const summaryRows = (summaryResult.data ?? []) as SummaryRow[];
  const unresolvedTotalCount = includeSummary ? (summaryRows.find((r) => r.sort_key === 0)?.cnt ?? 0) : null;
  const pendingTotalCount    = includeSummary ? (summaryRows.find((r) => r.sort_key === 1)?.cnt ?? 0) : null;
  const resolvedTotalCount   = includeSummary ? (summaryRows.find((r) => r.sort_key === 2)?.cnt ?? 0) : null;

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

  // Phase 2: 현재 페이지 상세 데이터 병렬 조회
  const [resResult, extraResult] = await Promise.all([
    guard.sbAdmin
      .from("hazard_report_resolutions")
      .select("report_id,after_path,after_public_url,after_memo,improved_by,improved_at,planned_due_date")
      .in("report_id", reportIds),
    guard.sbAdmin
      .from("hazard_report_photos")
      .select("id,report_id,photo_path,photo_url,created_at")
      .in("report_id", reportIds)
      .order("created_at", { ascending: false }),
  ]);

  if (resResult.error) return json(false, resResult.error.message, null, 500);
  if (extraResult.error) return json(false, extraResult.error.message, null, 500);

  const resolutions = (resResult.data ?? []) as ResolutionRow[];
  const extraPhotos = (extraResult.data ?? []) as ExtraPhotoRow[];

  const resMap: Record<string, ResolutionRow> = {};
  for (const r of resolutions) resMap[r.report_id] = r;

  const extraPhotoMap: Record<string, ExtraPhotoRow[]> = {};
  for (const photo of extraPhotos) {
    if (!extraPhotoMap[photo.report_id]) extraPhotoMap[photo.report_id] = [];
    extraPhotoMap[photo.report_id].push(photo);
  }

  // Phase 3: 창작자 + 처리자 프로필 단일 조회 (2번→1번)
  const allProfileIds = Array.from(new Set([
    ...reports.map((r) => r.user_id),
    ...resolutions.map((r) => r.improved_by).filter((v): v is string => !!v),
  ]));

  const nameMap: Record<string, string | null> = {};
  if (allProfileIds.length > 0) {
    const { data: profileData } = await guard.sbAdmin
      .from("profiles")
      .select("id,name")
      .in("id", allProfileIds);
    for (const p of (profileData ?? []) as { id: string; name: string | null }[]) {
      nameMap[p.id] = p.name;
    }
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
