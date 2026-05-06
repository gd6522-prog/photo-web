import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePage(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const url = new URL(req.url);
    const startdate = (url.searchParams.get("startdate") ?? "").trim();
    const enddate = (url.searchParams.get("enddate") ?? "").trim();
    const vehicle = (url.searchParams.get("vehicle") ?? "").trim();
    const page = parsePage(url.searchParams.get("page"));

    if (!VALID_DATE_RE.test(startdate) || !VALID_DATE_RE.test(enddate)) {
      return json(false, "startdate / enddate 가 올바르지 않습니다 (YYYY-MM-DD).", null, 400);
    }
    if (startdate > enddate) {
      return json(false, "시작일은 종료일 이전이어야 합니다.", null, 400);
    }

    const r = await sregist.searchInoutHistory({ startdate, enddate, vehicle, page });
    if (!r.success) return json(false, r.error, null, 502);

    // 차량번호별 parking_requests 매칭으로 type / visit_purpose 보강.
    const carNumbers = Array.from(new Set(r.items.map((i) => i.vNo).filter(Boolean)));
    const matchMap = new Map<string, { type: "regular" | "visitor"; visit_purpose: string | null; visit_date: string | null }>();

    if (carNumbers.length) {
      const { data: rows, error: dbErr } = await guard.sbAdmin
        .from("parking_requests")
        .select("car_number, type, visit_purpose, visit_date, created_at")
        .in("car_number", carNumbers)
        .order("created_at", { ascending: false });

      if (!dbErr && Array.isArray(rows)) {
        // 차량번호별 가장 최근 record 사용 (이미 created_at desc 정렬됨)
        for (const row of rows as Array<{ car_number: string; type: "regular" | "visitor"; visit_purpose: string | null; visit_date: string | null }>) {
          if (!matchMap.has(row.car_number)) {
            matchMap.set(row.car_number, {
              type: row.type,
              visit_purpose: row.visit_purpose,
              visit_date: row.visit_date,
            });
          }
        }
      }
    }

    const items = r.items.map((it) => {
      const m = matchMap.get(it.vNo);
      return {
        vNo: it.vNo,
        vType: it.vType,            // sregist 가 인식한 차량 구분 (등록차량/영업차량/배송차량 등)
        inTime: it.inTime,
        outTime: it.outTime,        // 빈 문자열이면 미출차
        dridoType: m?.type ?? null, // "regular" | "visitor" | null (Drido 신청 매칭)
        visitPurpose: m?.visit_purpose ?? null,
      };
    });

    return json(true, undefined, {
      items,
      totalPages: r.totalPages,
      totalCount: r.totalCount,
      page,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
