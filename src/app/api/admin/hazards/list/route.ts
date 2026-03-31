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

  // DB 레벨 페이징: sort_key ASC → created_at DESC
  const reportsQuery = guard.sbAdmin
    .from("hazard_reports")
    .select("id,user_id,comment,photo_path,photo_url,created_at,sort_key", { count: "exact" })
    .order("sort_key", { ascending: true })
    .order("created_at", { ascending: false })
    .range(from, to);

  const summaryQueries = includeSummary
    ? [
        guard.sbAdmin.from("hazard_reports").select("id", { count: "exact", head: true }).eq("sort_key", 0),
        guard.sbAdmin.from("hazard_reports").select("id", { count: "exact", head: true }).eq("sort_key", 1),
        guard.sbAdmin.from("hazard_reports").select("id", { count: "exact", head: true }).eq("sort_key", 2),
      ]
    : [
        Promise.resolve({ count: null as number | null, error: null }),
        Promise.resolve({ count: null as number | null, error: null }),
        Promise.resolve({ count: null as number | null, error: null }),
      ];

  const [reportsResult, unresolvedResult, pendingResult, resolvedResult] = await Promise.all([
    reportsQuery,
    ...summaryQueries,
  ]);

  if (reportsResult.error) return json(false, reportsResult.error.message, null, 500);

  const reports = (reportsResult.data ?? []) as ReportRow[];
  const totalCount = reportsResult.count ?? 0;
  const reportIds = reports.map((r) => r.id);
  const creatorIds = Array.from(new Set(reports.map((r) => r.user_id)));

  const unresolvedTotalCount = includeSummary ? (unresolvedResult.count ?? 0) : null;
  const pendingTotalCount = includeSummary ? (pendingResult.count ?? 0) : null;
  const resolvedTotalCount = includeSummary ? (resolvedResult.count ?? 0) : null;

  // 현재 페이지 항목 상세 데이터 병렬 조회
  const [resResult, extraResult, profilesResult] = await Promise.all([
    reportIds.length > 0
      ? guard.sbAdmin
          .from("hazard_report_resolutions")
          .select("report_id,after_path,after_public_url,after_memo,improved_by,improved_at,planned_due_date")
          .in("report_id", reportIds)
      : Promise.resolve({ data: [] as ResolutionRow[], error: null }),
    reportIds.length > 0
      ? guard.sbAdmin
          .from("hazard_report_photos")
          .select("id,report_id,photo_path,photo_url,created_at")
          .in("report_id", reportIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ExtraPhotoRow[], error: null }),
    creatorIds.length > 0
      ? guard.sbAdmin.from("profiles").select("id,name").in("id", creatorIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null }),
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

  const nameMap: Record<string, string | null> = {};
  for (const p of (profilesResult.data ?? []) as { id: string; name: string | null }[]) {
    nameMap[p.id] = p.name;
  }

  // 처리자(improved_by) 중 아직 조회되지 않은 ID만 추가 조회
  const improverIds = Array.from(
    new Set(resolutions.map((r) => r.improved_by).filter((v): v is string => !!v && !(v in nameMap)))
  );
  if (improverIds.length > 0) {
    const { data: improverData } = await guard.sbAdmin.from("profiles").select("id,name").in("id", improverIds);
    for (const p of (improverData ?? []) as { id: string; name: string | null }[]) {
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
    totalCount: includeSummary ? totalCount : null,
    unresolvedTotalCount,
    pendingTotalCount,
    resolvedTotalCount,
    page,
    pageSize,
    includeSummary,
  });
}
