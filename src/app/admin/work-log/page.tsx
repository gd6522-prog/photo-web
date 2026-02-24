"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProfileLite = {
  id: string;
  name?: string | null;
  work_part?: string | null;
  company_name?: string | null;
  work_table?: string | null; // 전체 문자열
};

type JoinedProfiles = ProfileLite | ProfileLite[] | null;

type ShiftRow = {
  id: string;
  user_id: string;
  work_date: string; // yyyy-mm-dd
  status: "open" | "closed" | "void";
  clock_in_at: string | null;
  clock_out_at: string | null;

  clock_in_lat: number | null;
  clock_in_lng: number | null;

  clock_out_lat: number | null;
  clock_out_lng: number | null;

  created_at: string;
  updated_at: string;

  profiles?: JoinedProfiles;
};

const COMPANY_OPTIONS = ["한익스프레스", "경산씨스템", "더블에스잡", "비상GLS"] as const;

const WORK_TABLE_OPTIONS = [
  "조출A 06시00분~15시00분",
  "조출B 07시00분~16시00분",
  "사무 08시30분~17시30분",
  "현장A 09시30분~18시30분",
  "현장B 10시30분~19시30분",
] as const;

function kstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function defaultDay(): string {
  return kstNow().toISOString().slice(0, 10);
}

function fmtKSTTime(ts: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function minutesDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.max(0, Math.round((db - da) / 60000));
}

function hhmmFromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function gmLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function normalizeProfile(p: JoinedProfiles | undefined): ProfileLite | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function workTableShort(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  return s.split(" ")[0] || "-";
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}

function toKoreanErrorMessage(e: any): string {
  const raw = String(e?.message ?? e ?? "");
  const lower = raw.toLowerCase();

  if (lower.includes("row-level security") || lower.includes("rls")) {
    return "권한 정책(RLS) 때문에 접근이 거부되었습니다. 관리자 정책을 확인해 주세요.";
  }
  if (lower.includes("relationship") && lower.includes("could not find")) {
    return "조인 관계(work_shifts.user_id ↔ profiles.id)가 Supabase에 설정되어 있지 않습니다. (FK/관계 설정 필요)";
  }
  return raw || "불러오기 실패";
}

export default function WorkLogPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ 일 단위
  const [day, setDay] = useState<string>(() => defaultDay());

  // ✅ 필터(순서: 날짜, 회사명, 작업파트, 이름, 근무테이블)
  const [company, setCompany] = useState<string>("");
  const [workPart, setWorkPart] = useState<string>("");
  const [nameQ, setNameQ] = useState<string>("");
  const [workTable, setWorkTable] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [workPartOptions, setWorkPartOptions] = useState<string[]>([]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount]);

  // 작업파트 옵션(기존처럼 profiles에서 추출)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("work_part").not("work_part", "is", null);
        if (error) throw error;
        const parts = uniq((data ?? []).map((r: any) => String(r.work_part ?? "")));
        if (alive) setWorkPartOptions(parts);
      } catch {
        if (alive) setWorkPartOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 필터 바뀌면 1페이지로
  useEffect(() => {
    setPage(1);
  }, [day, company, workPart, nameQ, workTable]);

  async function fetchData(p: number) {
    setLoading(true);
    setErr(null);

    try {
      const rangeFrom = (p - 1) * pageSize;
      const rangeTo = rangeFrom + pageSize - 1;

      // 1) profiles에서 user_id 후보 추출 (필터가 하나라도 있으면)
      let allowedUserIds: string[] | null = null;

      const qName = nameQ.trim();
      const qPart = workPart.trim();
      const qCompany = company.trim();
      const qWT = workTable.trim();

      if (qName || qPart || qCompany || qWT) {
        let pq = supabase.from("profiles").select("id, name, work_part, company_name, work_table");

        if (qName) pq = pq.ilike("name", `%${qName}%`);
        if (qPart) pq = pq.eq("work_part", qPart);
        if (qCompany) pq = pq.eq("company_name", qCompany);
        if (qWT) pq = pq.eq("work_table", qWT);

        const { data: pRows, error: pErr } = await pq;
        if (pErr) throw pErr;

        allowedUserIds = (pRows ?? []).map((r: any) => String(r.id)).filter(Boolean);

        if (allowedUserIds.length === 0) {
          setRows([]);
          setTotalCount(0);
          return;
        }
      }

      // 2) work_shifts 조회 (일 단위 + user_id in)
      let sq = supabase
        .from("work_shifts")
        .select(
          `
          id,
          user_id,
          work_date,
          status,
          clock_in_at,
          clock_out_at,
          clock_in_lat,
          clock_in_lng,
          clock_out_lat,
          clock_out_lng,
          created_at,
          updated_at,
          profiles:profiles ( id, name, work_part, company_name, work_table )
        `,
          { count: "exact" }
        )
        .eq("work_date", day)
        .order("clock_in_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (allowedUserIds) sq = sq.in("user_id", allowedUserIds);

      const { data, error, count } = await sq.range(rangeFrom, rangeTo);
      if (error) throw error;

      setRows((data ?? []) as ShiftRow[]);
      setTotalCount(count ?? 0);
    } catch (e: any) {
      setErr(toKoreanErrorMessage(e));
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, day, company, workPart, nameQ, workTable]);

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>출퇴근 이력관리</h1>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          총 {totalCount.toLocaleString()}건 / 페이지 {page} / {totalPages}
        </div>
      </div>

      {/* Filters: 날짜 → 회사명 → 작업파트 → 이름 → 근무테이블 → 조회 */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          background: "white",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>날짜</span>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 240 }}>
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>회사명</span>
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", minWidth: 170 }}
          >
            <option value="">전체</option>
            {COMPANY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 240 }}>
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>작업파트</span>
          <select
            value={workPart}
            onChange={(e) => setWorkPart(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", minWidth: 170 }}
          >
            <option value="">전체</option>
            {workPartOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 220 }}>
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>이름</span>
          <input
            value={nameQ}
            onChange={(e) => setNameQ(e.target.value)}
            placeholder="이름"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", width: "100%" }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 340 }}>
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>근무</span>
          <select
            value={workTable}
            onChange={(e) => setWorkTable(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", minWidth: 260 }}
          >
            <option value="">전체</option>
            {WORK_TABLE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => fetchData(page)}
          disabled={loading}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            background: loading ? "rgba(0,0,0,0.04)" : "white",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          {loading ? "불러오는 중..." : "조회"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,0,0,0.06)", border: "1px solid rgba(255,0,0,0.18)", color: "rgba(120,0,0,0.9)", fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* Table */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, background: "white" }}>
          <thead>
            <tr>
              {["날짜", "회사", "근무", "작업파트", "이름", "상태", "출근", "퇴근", "근무시간", "출근위치", "퇴근위치", "상세"].map((h) => (
                <th
                  key={h}
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "white",
                    textAlign: "left",
                    fontSize: 12,
                    opacity: 0.85,
                    padding: "10px 10px",
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={12} style={{ padding: 16, opacity: 0.7 }}>
                  데이터 없음
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const p = normalizeProfile(s.profiles);
                const mins = minutesDiff(s.clock_in_at, s.clock_out_at);
                const inLink = gmLink(s.clock_in_lat, s.clock_in_lng);
                const outLink = gmLink(s.clock_out_lat, s.clock_out_lng);

                // 상태: 출근 찍었고 퇴근 전이면 근무중, 아니면 "-"
                const statusLabel = s.clock_in_at && !s.clock_out_at ? "근무중" : "-";

                return (
                  <tr key={s.id}>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)", fontWeight: 900 }}>{s.work_date}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{p?.company_name || "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{workTableShort(p?.work_table)}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{p?.work_part || "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)", fontWeight: 900 }}>{p?.name || "(이름없음)"}</td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      {statusLabel === "근무중" ? (
                        <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 950, border: "1px solid rgba(255,140,0,0.35)", background: "rgba(255,140,0,0.10)" }}>
                          근무중
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{fmtKSTTime(s.clock_in_at)}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{fmtKSTTime(s.clock_out_at)}</td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{mins == null ? "-" : hhmmFromMinutes(mins)}</td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      {inLink ? (
                        <a href={inLink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          지도
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      {outLink ? (
                        <a href={outLink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          지도
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <Link
                        href={`/admin/work-log/${s.id}`}
                        style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", display: "inline-block", fontWeight: 900 }}
                      >
                        보기
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13, opacity: 0.75 }}>표시: {rows.length.toLocaleString()}건 (페이지 기준)</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPage((x) => Math.max(1, x - 1))}
            disabled={loading || page <= 1}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", cursor: loading || page <= 1 ? "not-allowed" : "pointer", fontWeight: 900 }}
          >
            이전
          </button>

          <div style={{ fontWeight: 900 }}>
            {page} / {totalPages}
          </div>

          <button
            onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
            disabled={loading || page >= totalPages}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", cursor: loading || page >= totalPages ? "not-allowed" : "pointer", fontWeight: 900 }}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}