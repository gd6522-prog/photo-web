"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
};

type ProfileRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  work_part?: string | null;
};

function kstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function defaultMonth(): string {
  const kst = kstNow();
  return kst.toISOString().slice(0, 7); // YYYY-MM
}

function monthRange(month: string): { from: string; to: string } {
  // month: YYYY-MM
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr); // 1~12
  const from = `${month}-01`;
  // 마지막 일: new Date(y, m, 0) => m월의 0일 = m월의 마지막날
  const last = new Date(y, m, 0);
  const to = `${month}-${String(last.getDate()).padStart(2, "0")}`;
  return { from, to };
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

export default function WorkLogPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ 월 단위만
  const [month, setMonth] = useState<string>(() => defaultMonth());

  // 이름 검색만 유지
  const [q, setQ] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [totalCount, setTotalCount] = useState<number>(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount]);

  async function fetchData(p: number) {
    setLoading(true);
    setErr(null);

    try {
      const { from, to } = monthRange(month);

      let query = supabase
        .from("work_shifts")
        .select("*", { count: "exact" })
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .order("clock_in_at", { ascending: false });

      const rangeFrom = (p - 1) * pageSize;
      const rangeTo = rangeFrom + pageSize - 1;

      const { data: shiftRows, error: shiftErr, count } = await query.range(rangeFrom, rangeTo);

      if (shiftErr) throw shiftErr;

      const rows = (shiftRows || []) as ShiftRow[];
      setShifts(rows);
      setTotalCount(count ?? 0);

      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      if (userIds.length === 0) {
        setProfilesById({});
        return;
      }

      const { data: profRows, error: profErr } = await supabase
        .from("profiles")
        .select("id, name, phone, work_part")
        .in("id", userIds);

      if (profErr) throw profErr;

      const map: Record<string, ProfileRow> = {};
      for (const pr of (profRows || []) as ProfileRow[]) {
        map[pr.id] = pr;
      }
      setProfilesById(map);
    } catch (e: any) {
      setErr(e?.message || "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  // month 바뀌면 1페이지로
  useEffect(() => {
    setPage(1);
  }, [month]);

  useEffect(() => {
    fetchData(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, month]);

  const filteredShifts = useMemo(() => {
    const qq = q.trim();
    if (!qq) return shifts;

    return shifts.filter((s) => {
      const p = profilesById[s.user_id];
      const name = (p?.name || "").toString();
      return name.includes(qq);
    });
  }, [q, shifts, profilesById]);

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>출퇴근 이력관리</h1>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          총 {totalCount.toLocaleString()}건 / 페이지 {page} / {totalPages}
        </div>
      </div>

      {/* Filters */}
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
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>월</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 260 }}>
          <span style={{ width: 54, fontSize: 13, opacity: 0.8 }}>이름</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              width: "100%",
            }}
          />
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
            fontWeight: 800,
          }}
        >
          {loading ? "불러오는 중..." : "조회"}
        </button>
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(255,0,0,0.06)",
            border: "1px solid rgba(255,0,0,0.18)",
            color: "rgba(120,0,0,0.9)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {/* Table */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, background: "white" }}>
          <thead>
            <tr>
              {["날짜", "이름", "파트", "상태", "출근", "퇴근", "근무시간", "출근위치", "퇴근위치", "상세"].map((h) => (
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
            {filteredShifts.length === 0 && !loading ? (
              <tr>
                <td colSpan={10} style={{ padding: 16, opacity: 0.7 }}>
                  데이터 없음
                </td>
              </tr>
            ) : (
              filteredShifts.map((s) => {
                const p = profilesById[s.user_id];
                const mins = minutesDiff(s.clock_in_at, s.clock_out_at);
                const inLink = gmLink(s.clock_in_lat, s.clock_in_lng);
                const outLink = gmLink(s.clock_out_lat, s.clock_out_lng);

                // ✅ 상태 규칙: 출근 찍었으면 근무중, 아니면 "-"
                const statusLabel = s.clock_in_at && !s.clock_out_at ? "근무중" : "-";

                return (
                  <tr key={s.id}>
                    {/* 날짜: YYYY-MM-DD만 */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ fontWeight: 800 }}>{s.work_date}</div>
                    </td>

                    {/* 이름만 */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ fontWeight: 800 }}>{p?.name || "(이름없음)"}</div>
                    </td>

                    {/* 파트 그대로 */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      {p?.work_part || "-"}
                    </td>

                    {/* 상태 */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 900,
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: statusLabel === "근무중" ? "rgba(255,140,0,0.08)" : "rgba(0,0,0,0.04)",
                        }}
                      >
                        {statusLabel}
                      </span>
                    </td>

                    {/* 출근: 시간만(ACC 제거) */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <div>{fmtKSTTime(s.clock_in_at)}</div>
                    </td>

                    {/* 퇴근: 시간만(ACC 제거) */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <div>{fmtKSTTime(s.clock_out_at)}</div>
                    </td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      {mins == null ? "-" : hhmmFromMinutes(mins)}
                    </td>

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
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.15)",
                          display: "inline-block",
                          fontWeight: 900,
                        }}
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
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          표시: {filteredShifts.length.toLocaleString()}건 (페이지 기준)
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPage((x) => Math.max(1, x - 1))}
            disabled={loading || page <= 1}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              cursor: loading || page <= 1 ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            이전
          </button>

          <div style={{ fontWeight: 900 }}>
            {page} / {totalPages}
          </div>

          <button
            onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
            disabled={loading || page >= totalPages}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              cursor: loading || page >= totalPages ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}