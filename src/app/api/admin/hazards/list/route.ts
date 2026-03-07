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
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: reportsData, count, error: reportsErr } = await guard.sbAdmin
    .from("hazard_reports")
    .select("id,user_id,comment,photo_path,photo_url,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (reportsErr) return json(false, reportsErr.message, null, 500);

  const reports = (reportsData ?? []) as ReportRow[];
  const reportIds = reports.map((r) => r.id);

  let resolutions: ResolutionRow[] = [];
  if (reportIds.length > 0) {
    const { data: resData, error: resErr } = await guard.sbAdmin
      .from("hazard_report_resolutions")
      .select("report_id,after_path,after_public_url,after_memo,improved_by,improved_at")
      .in("report_id", reportIds);
    if (resErr) return json(false, resErr.message, null, 500);
    resolutions = (resData ?? []) as ResolutionRow[];
  }

  const resMap: Record<string, ResolutionRow> = {};
  for (const r of resolutions) resMap[r.report_id] = r;

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
    };
  });

  // 전체 미처리 건수 = 전체 제보 수 - 처리완료(개선사진 존재) 수
  const { count: resolvedCount, error: resolvedCountErr } = await guard.sbAdmin
    .from("hazard_report_resolutions")
    .select("report_id", { count: "exact", head: true })
    .not("after_public_url", "is", null);
  if (resolvedCountErr) return json(false, resolvedCountErr.message, null, 500);

  const total = count ?? 0;
  const unresolvedTotalCount = Math.max(0, total - (resolvedCount ?? 0));

  return json(true, undefined, {
    items,
    totalCount: count ?? 0,
    unresolvedTotalCount,
    page,
    pageSize,
  });
}
