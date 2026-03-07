"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProfileLite = {
  id: string;
  name?: string | null;
  work_part?: string | null;
  company_name?: string | null;
  work_table?: string | null;
};

type JoinedProfiles = ProfileLite | ProfileLite[] | null;

type ShiftRow = {
  id: string;
  user_id: string;
  work_date: string;
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
  "조출A 06:00~15:00",
  "조출B 07:00~16:00",
  "주간 08:00~17:00",
  "후반A 09:00~18:00",
  "후반B 10:00~19:00",
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
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
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

function toKoreanErrorMessage(e: unknown): string {
  const raw = String((e as Error)?.message ?? e ?? "");
  const lower = raw.toLowerCase();

  if (lower.includes("row-level security") || lower.includes("rls")) {
    return "권한 정책(RLS) 때문에 조회가 거부되었습니다. 관리자 권한을 확인해 주세요.";
  }
  if (lower.includes("relationship") && lower.includes("could not find")) {
    return "조인 관계(work_shifts.user_id ↔ profiles.id)가 Supabase에 설정되어 있지 않습니다.";
  }
  return raw || "불러오기 실패";
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #DDE3EA",
  borderRadius: 16,
  background: "white",
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
};

export default function WorkLogPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [day, setDay] = useState<string>(() => defaultDay());
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("work_part").not("work_part", "is", null);
        if (error) throw error;
        const parts = uniq((data ?? []).map((r) => String((r as { work_part?: string | null }).work_part ?? "")));
        if (alive) setWorkPartOptions(parts);
      } catch {
        if (alive) setWorkPartOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [day, company, workPart, nameQ, workTable]);

  async function fetchData(p: number) {
    setLoading(true);
    setErr(null);
    try {
      const rangeFrom = (p - 1) * pageSize;
      const rangeTo = rangeFrom + pageSize - 1;

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

        allowedUserIds = (pRows ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
        if (allowedUserIds.length === 0) {
          setRows([]);
          setTotalCount(0);
          return;
        }
      }

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
    } catch (e: unknown) {
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
    <div style={{ padding: 16, maxWidth: 1480, margin: "0 auto", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", background: "#F3F5F8", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>출퇴근 이력관리</h1>
        <div style={{ color: "#64748B", fontSize: 13, fontWeight: 700 }}>
          총 {totalCount.toLocaleString()}건 / 페이지 {page} / {totalPages}
        </div>
      </div>

      <div
        style={{
          ...cardStyle,
          marginTop: 12,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "180px 220px 220px 1fr 280px auto",
          gap: 10,
          alignItems: "end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>날짜</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 10px" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>회사명</span>
          <select value={company} onChange={(e) => setCompany(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 10px", background: "white" }}>
            <option value="">전체</option>
            {COMPANY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>작업파트</span>
          <select value={workPart} onChange={(e) => setWorkPart(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 10px", background: "white" }}>
            <option value="">전체</option>
            {workPartOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>이름</span>
          <input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="이름 검색" style={{ height: 40, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 10px" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>근무테이블</span>
          <select value={workTable} onChange={(e) => setWorkTable(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 10px", background: "white" }}>
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
            height: 40,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: loading ? "#CBD5E1" : "#111827",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          {loading ? "불러오는 중..." : "조회"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
          {err}
        </div>
      )}

      <div style={{ ...cardStyle, marginTop: 12, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, background: "white" }}>
          <thead>
            <tr>
              {["날짜", "회사", "근무", "작업파트", "이름", "상태", "출근", "퇴근", "근무시간", "출근위치", "퇴근위치", "상세"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, color: "#64748B", fontWeight: 800, padding: "12px 10px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={12} style={{ padding: 16, color: "#64748B" }}>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((s, idx) => {
                const p = normalizeProfile(s.profiles);
                const mins = minutesDiff(s.clock_in_at, s.clock_out_at);
                const inLink = gmLink(s.clock_in_lat, s.clock_in_lng);
                const outLink = gmLink(s.clock_out_lat, s.clock_out_lng);
                const isWorking = !!s.clock_in_at && !s.clock_out_at;
                const rowBg = idx % 2 === 0 ? "white" : "#FCFDFE";

                return (
                  <tr key={s.id}>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg, fontWeight: 800 }}>{s.work_date}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>{p?.company_name || "-"}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>{workTableShort(p?.work_table)}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>{p?.work_part || "-"}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg, fontWeight: 800 }}>{p?.name || "(이름없음)"}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>
                      {isWorking ? (
                        <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, border: "1px solid rgba(255,140,0,0.35)", background: "rgba(255,140,0,0.10)", color: "#9A3412" }}>근무중</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>{fmtKSTTime(s.clock_in_at)}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>{fmtKSTTime(s.clock_out_at)}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>{mins == null ? "-" : hhmmFromMinutes(mins)}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>
                      {inLink ? (
                        <a href={inLink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "#0F172A", fontWeight: 700 }}>
                          지도
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>
                      {outLink ? (
                        <a href={outLink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "#0F172A", fontWeight: 700 }}>
                          지도
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #EEF2F6", background: rowBg }}>
                      <Link href={`/admin/work-log/${s.id}`} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #CBD5E1", display: "inline-block", fontWeight: 800, color: "#0F172A", textDecoration: "none" }}>
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

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13, color: "#64748B" }}>표시: {rows.length.toLocaleString()}건 (현재 페이지)</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPage((x) => Math.max(1, x - 1))}
            disabled={loading || page <= 1}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #D1D5DB", background: "white", cursor: loading || page <= 1 ? "not-allowed" : "pointer", fontWeight: 900 }}
          >
            이전
          </button>

          <div style={{ fontWeight: 900 }}>
            {page} / {totalPages}
          </div>

          <button
            onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
            disabled={loading || page >= totalPages}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #D1D5DB", background: "white", cursor: loading || page >= totalPages ? "not-allowed" : "pointer", fontWeight: 900 }}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
