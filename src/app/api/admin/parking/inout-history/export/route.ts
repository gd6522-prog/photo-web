import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { json, requireAdmin } from "../../../notices/_shared";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGES = 200; // 안전장치

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const url = new URL(req.url);
    const startdate = (url.searchParams.get("startdate") ?? "").trim();
    const enddate = (url.searchParams.get("enddate") ?? "").trim();
    const vehicle = (url.searchParams.get("vehicle") ?? "").trim();

    if (!VALID_DATE_RE.test(startdate) || !VALID_DATE_RE.test(enddate)) {
      return json(false, "startdate / enddate 가 올바르지 않습니다 (YYYY-MM-DD).", null, 400);
    }
    if (startdate > enddate) {
      return json(false, "시작일은 종료일 이전이어야 합니다.", null, 400);
    }

    // 1) sregist 모든 페이지 순회
    const all: Array<{ vNo: string; vType: string; inTime: string; outTime: string }> = [];
    let page = 1;
    while (page <= MAX_PAGES) {
      const r = await sregist.searchInoutHistory({ startdate, enddate, vehicle, page });
      if (!r.success) {
        return json(false, `sregist 조회 실패: ${r.error}`, null, 502);
      }
      all.push(...r.items);
      if (page >= r.totalPages || r.items.length === 0) break;
      page++;
    }

    // 2) parking_requests JOIN
    const carNumbers = Array.from(new Set(all.map((i) => i.vNo).filter(Boolean)));
    const matchMap = new Map<
      string,
      {
        type: "regular" | "visitor";
        company: string | null;
        name: string | null;
        phone: string | null;
      }
    >();

    if (carNumbers.length) {
      const { data: rows } = await guard.sbAdmin
        .from("parking_requests")
        .select("car_number, type, company, name, phone, created_at")
        .in("car_number", carNumbers)
        .order("created_at", { ascending: false });

      for (const row of (rows ?? []) as Array<{
        car_number: string;
        type: "regular" | "visitor";
        company: string | null;
        name: string | null;
        phone: string | null;
      }>) {
        if (!matchMap.has(row.car_number)) {
          matchMap.set(row.car_number, {
            type: row.type,
            company: row.company,
            name: row.name,
            phone: row.phone,
          });
        }
      }
    }

    // 3) Excel 데이터 구성 — 페이지와 동일 컬럼 순서
    const aoa: (string | number)[][] = [
      ["구분", "업체명", "차량번호", "이름", "연락처", "입차일시", "출차일시"],
    ];
    for (const it of all) {
      const m = matchMap.get(it.vNo);
      const typeLabel = m?.type === "regular" ? "정기" : m?.type === "visitor" ? "방문" : "";
      aoa.push([
        typeLabel,
        m?.company ?? "",
        it.vNo ?? "",
        m?.name ?? "",
        m?.phone ?? "",
        it.inTime ?? "",
        it.outTime ?? "",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 컬럼 폭
    ws["!cols"] = [
      { wch: 8 },   // 구분
      { wch: 20 },  // 업체명
      { wch: 14 },  // 차량번호
      { wch: 10 },  // 이름
      { wch: 16 },  // 연락처
      { wch: 18 },  // 입차일시
      { wch: 18 },  // 출차일시
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "입출차내역");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const filename = `입출차내역_${startdate}_${enddate}.xlsx`;
    // 한글 파일명을 RFC 5987 형식으로 인코딩
    const encoded = encodeURIComponent(filename);

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="parking-inout.xlsx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
