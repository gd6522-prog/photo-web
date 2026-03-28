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

  // Phase 1: 전체 보고서 조회 (앱 레벨에서 유효 sort_key 계산 후 정렬)
  const allReportsResult = await guard.sbAdmin
    .from("hazard_reports")
    .select("id,user_id,comment,photo_path,photo_url,created_at,sort_key")
    .order("created_at", { ascending: false });

  if (allReportsResult.error) return json(false, allReportsResult.error.message, null, 500);

  const allReports = (allReportsResult.data ?? []) as ReportRow[];
  const today = new Date().toISOString().slice(0, 10);

  // sort_key=1(처리대기) 항목의 최신 resolution 조회 → 만료 여부 판단
  const pendingIds = allReports.filter((r) => r.sort_key === 1).map((r) => r.id);
  type ShortRes = { report_id: string; planned_due_date: string | null; improved_at: string | null };
  const latestResMap = new Map<string, ShortRes>();
  if (pendingIds.length > 0) {
    const { data: resData } = await guard.sbAdmin
      .from("hazard_report_resolutions")
      .select("report_id, planned_due_date, improved_at")
      .in("report_id", pendingIds);
    for (const res of (resData ?? []) as ShortRes[]) {
      const ex = latestResMap.get(res.report_id);
      if (!ex || (res.improved_at ?? "") >= (ex.improved_at ?? "")) {
        latestResMap.set(res.report_id, res);
      }
    }
  }

  function effectiveSortKey(r: ReportRow): number {
    if (r.sort_key === 2) return 2;
    if (r.sort_key === 1) {
      const res = latestResMap.get(r.id);
      if (res?.planned_due_date && res.planned_due_date >= today) return 1;
      return 0; // 기간 만료 → 미처리
    }
    return 0;
  }

  // 유효 sort_key 오름차순, 동일하면 created_at 내림차순
  const sorted = [...allReports].sort((a, b) => {
    const diff = effectiveSortKey(a) - effectiveSortKey(b);
    if (diff !== 0) return diff;
    return b.created_at.localeCompare(a.created_at);
  });

  const totalCount = sorted.length;
  const reports = sorted.slice(from, to + 1);
  const reportIds = reports.map((r) => r.id);
  const creatorIds = Array.from(new Set(reports.map((r) => r.user_id)));

  // 요약 카운트 집계
  let unresolvedTotalCount: number | null = null;
  let pendingTotalCount: number | null = null;
  let resolvedTotalCount: number | null = null;
  if (includeSummary) {
    unresolvedTotalCount = sorted.filter((r) => effectiveSortKey(r) === 0).length;
    pendingTotalCount = sorted.filter((r) => effectiveSortKey(r) === 1).length;
    resolvedTotalCount = sorted.filter((r) => effectiveSortKey(r) === 2).length;
  }

  // Phase 2: 현재 페이지 항목에 대한 상세 데이터 병렬 조회 (최대 pageSize건)
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
