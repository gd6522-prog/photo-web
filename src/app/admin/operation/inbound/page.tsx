"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { InboundRow } from "@/app/api/admin/inbound-status/route";

type SortKey = keyof Pick<
  InboundRow,
  "inb_ect_date" | "inb_date" | "suppr_nm" | "item_cd" | "item_nm" |
  "inb_status" | "shortage_status" | "ord_qty" | "inb_qty" | "miss_qty"
>;
type SortDir = "asc" | "desc";

async function getAdminToken() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((r) => window.setTimeout(r, 250));
  }
  throw new Error("로그인 세션이 없습니다.");
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

// YYYYMMDD → YYYY.MM.DD
function fmtDate(s: string) {
  const clean = s.replace(/\D/g, "");
  if (clean.length === 8) return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6, 8)}`;
  return s || "-";
}

const INBOUND_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "입고완료": { bg: "#DCFCE7", color: "#15803D" },
  "입고예정": { bg: "#DBEAFE", color: "#1D4ED8" },
  "미입고":   { bg: "#FEF9C3", color: "#A16207" },
  "결품":     { bg: "#FEE2E2", color: "#DC2626" },
};

function StatusBadge({ label }: { label: string }) {
  const style = INBOUND_STATUS_COLORS[label] ?? { bg: "#F1F5F9", color: "#475569" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      background: style.bg,
      color: style.color,
      whiteSpace: "nowrap",
    }}>
      {label || "-"}
    </span>
  );
}

export default function InboundPage() {
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("inb_ect_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const token = await getAdminToken();
        const res = await fetch("/api/admin/inbound-status", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) { setError("데이터를 불러오지 못했습니다."); return; }
        const data = await res.json() as { ok: boolean; rows?: InboundRow[]; uploadedAt?: string | null };
        setRows(data.rows ?? []);
        setUploadedAt(data.uploadedAt ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 날짜 필터 옵션 (입고예정일자 기준)
  const dateOptions = useMemo(() => {
    const dates = [...new Set(rows.map((r) => r.inb_ect_date).filter(Boolean))].sort();
    return dates;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dateFilter && r.inb_ect_date !== dateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.item_cd.toLowerCase().includes(q) ||
          r.item_nm.toLowerCase().includes(q) ||
          r.suppr_nm.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, dateFilter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), "ko");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => ({
    ord_qty:   filtered.reduce((s, r) => s + r.ord_qty, 0),
    inb_qty:   filtered.reduce((s, r) => s + r.inb_qty, 0),
    miss_qty:  filtered.reduce((s, r) => s + r.miss_qty, 0),
  }), [filtered]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#CBD5E1", marginLeft: 4 }}>↕</span>;
    return <span style={{ color: "#3B82F6", marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const COLS: Array<{ key: SortKey; label: string; align?: "right" | "center" }> = [
    { key: "inb_ect_date",    label: "입고예정일" },
    { key: "inb_date",        label: "입고일" },
    { key: "suppr_nm",        label: "공급거래처" },
    { key: "item_cd",         label: "상품코드" },
    { key: "item_nm",         label: "상품명" },
    { key: "inb_status",      label: "입고상태",  align: "center" },
    { key: "shortage_status", label: "결품상태",  align: "center" },
    { key: "ord_qty",         label: "발주수량",  align: "right" },
    { key: "inb_qty",         label: "입고수량",  align: "right" },
    { key: "miss_qty",        label: "결품수량",  align: "right" },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1300, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>입고예정</h1>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 0 }}>
          오늘~D+2 기간의 입고예정 현황입니다.
          {uploadedAt && (
            <span style={{ marginLeft: 10, color: "#94A3B8" }}>· 파일 기준: {uploadedAt}</span>
          )}
        </p>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={{
            padding: "7px 12px",
            border: "1px solid #E2E8F0",
            borderRadius: 7,
            fontSize: 13,
            color: "#374151",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          <option value="">전체 날짜</option>
          {dateOptions.map((d) => (
            <option key={d} value={d}>{fmtDate(d)}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="상품코드 / 상품명 / 공급거래처 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "7px 12px",
            border: "1px solid #E2E8F0",
            borderRadius: 7,
            fontSize: 13,
            width: 280,
            outline: "none",
          }}
        />

        {(search || dateFilter) && (
          <button
            onClick={() => { setSearch(""); setDateFilter(""); }}
            style={{
              padding: "7px 14px",
              background: "#F1F5F9",
              border: "none",
              borderRadius: 7,
              fontSize: 12,
              color: "#475569",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            초기화
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <style>{`@keyframes ib-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "4px solid #E2E8F0", borderTopColor: "#1D4ED8",
            animation: "ib-spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 14, color: "#64748B", fontWeight: 600 }}>데이터 불러오는 중...</div>
        </div>
      ) : error ? (
        <div style={{ padding: 48, textAlign: "center", color: "#EF4444", fontSize: 14 }}>{error}</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 64, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 15, color: "#64748B", fontWeight: 600 }}>입고예정 파일이 없습니다.</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 6 }}>파일 업로드 설정에서 입고예정 파일을 업로드해주세요.</div>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "조회 건수",  value: `${fmt(filtered.length)}건`,     color: "#1E293B" },
              { label: "발주수량",   value: fmt(totals.ord_qty),              color: "#1D4ED8" },
              { label: "입고수량",   value: fmt(totals.inb_qty),              color: "#15803D" },
              { label: "결품수량",   value: fmt(totals.miss_qty),             color: totals.miss_qty > 0 ? "#DC2626" : "#94A3B8" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "#fff",
                border: "1px solid #E8EDF2",
                borderRadius: 8,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontSize: 12, color: "#64748B" }}>{s.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* 테이블 */}
          <div style={{ border: "1px solid #E8EDF2", borderRadius: 10, background: "#fff", overflow: "auto", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {COLS.map(({ key, label, align }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      style={{
                        textAlign: align ?? "left",
                        padding: "10px 14px",
                        borderBottom: "2px solid #E8EDF2",
                        fontSize: 12,
                        fontWeight: 700,
                        color: sortKey === key ? "#1E293B" : "#64748B",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                      <SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  sorted.map((row, i) => (
                    <tr key={`${row.item_cd}-${row.inb_ect_date}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, whiteSpace: "nowrap", color: "#374151", fontWeight: 600 }}>
                        {fmtDate(row.inb_ect_date)}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, whiteSpace: "nowrap", color: "#94A3B8" }}>
                        {row.inb_date ? fmtDate(row.inb_date) : "-"}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151" }}>
                        {row.suppr_nm || "-"}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>
                        {row.item_cd}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#0F172A" }}>
                        {row.item_nm}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", textAlign: "center" }}>
                        <StatusBadge label={row.inb_status} />
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", textAlign: "center" }}>
                        <StatusBadge label={row.shortage_status} />
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, textAlign: "right", color: "#1D4ED8", fontWeight: 600 }}>
                        {row.ord_qty > 0 ? fmt(row.ord_qty) : "-"}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, textAlign: "right", color: "#15803D", fontWeight: 600 }}>
                        {row.inb_qty > 0 ? fmt(row.inb_qty) : "-"}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 13, textAlign: "right", fontWeight: 700, color: row.miss_qty > 0 ? "#DC2626" : "#94A3B8" }}>
                        {row.miss_qty > 0 ? fmt(row.miss_qty) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
