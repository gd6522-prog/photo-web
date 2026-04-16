"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SeparateEntry = {
  date: string;
  store_code: string;
  store_name: string;
  product_code: string;
  product_name: string;
  qty: number;
  center_unit: number;
};

type SortKey = "date" | "store_code" | "store_name" | "product_name" | "qty" | "separate_unit";
type SortDir = "asc" | "desc";

async function getAdminToken() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("로그인 세션이 없습니다.");
}

function formatDate(isoDate: string) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${y}.${m}.${d}`;
}

function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

function separateUnit(entry: SeparateEntry): number | null {
  if (!entry.center_unit || entry.center_unit <= 0) return null;
  return entry.qty / entry.center_unit;
}

function formatUnit(val: number | null): string {
  if (val === null) return "-";
  if (val % 1 !== 0) return val.toFixed(2);
  return formatNumber(val);
}

export default function SeparatePage() {
  const [entries, setEntries] = useState<SeparateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const token = await getAdminToken();
        const res = await fetch("/api/admin/separate-qty?all=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          setError("데이터를 불러오지 못했습니다.");
          return;
        }
        const payload = (await res.json()) as { ok: boolean; entries?: SeparateEntry[] };
        setEntries(payload.entries ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "store_code") cmp = a.store_code.localeCompare(b.store_code);
      else if (sortKey === "store_name") cmp = a.store_name.localeCompare(b.store_name, "ko");
      else if (sortKey === "product_name") cmp = a.product_name.localeCompare(b.product_name, "ko");
      else if (sortKey === "qty") cmp = a.qty - b.qty;
      else if (sortKey === "separate_unit") {
        const av = separateUnit(a) ?? 0;
        const bv = separateUnit(b) ?? 0;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#CBD5E1", marginLeft: 4 }}>↕</span>;
    return <span style={{ color: "#3B82F6", marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const totalQty = useMemo(() => sortedEntries.reduce((s, e) => s + e.qty, 0), [sortedEntries]);

  const COLS: Array<{ key: SortKey; label: string; align?: "right" }> = [
    { key: "date", label: "일자" },
    { key: "store_code", label: "점포코드" },
    { key: "store_name", label: "점포명" },
    { key: "product_name", label: "상품명" },
    { key: "qty", label: "별도수량", align: "right" },
    { key: "separate_unit", label: "별도배수", align: "right" },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>별도작업</h1>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>단품별 페이지에서 입력된 별도수량 내역입니다.</p>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>불러오는 중...</div>
      ) : error ? (
        <div style={{ padding: 48, textAlign: "center", color: "#EF4444", fontSize: 14 }}>{error}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#64748B", fontWeight: 700 }}>
              전체 {sortedEntries.length}건 &middot; 별도수량 합계 {formatNumber(totalQty)}
            </div>
          </div>

          <div style={{ border: "1px solid #E8EDF2", borderRadius: 10, background: "#fff", overflow: "auto", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {COLS.map(({ key, label, align }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      style={{
                        textAlign: align ?? "left",
                        padding: "10px 16px",
                        borderBottom: "2px solid #E8EDF2",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#64748B",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                      <SortIcon col={key} />
                    </th>
                  ))}
                  <th style={{ textAlign: "left", padding: "10px 16px", borderBottom: "2px solid #E8EDF2", fontSize: 12, fontWeight: 700, color: "#64748B", whiteSpace: "nowrap" }}>
                    상품코드
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                      등록된 별도수량이 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((entry, i) => {
                    const unitVal = separateUnit(entry);
                    const isDecimal = unitVal !== null && unitVal % 1 !== 0;
                    return (
                      <tr key={`${entry.date}-${entry.store_code}-${entry.product_code}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {formatDate(entry.date)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#64748B" }}>
                          {entry.store_code}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                          {entry.store_name}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151" }}>
                          {entry.product_name}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 700, color: "#1D4ED8", textAlign: "right" }}>
                          {formatNumber(entry.qty)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 700, color: isDecimal ? "#EF4444" : "#1D4ED8", textAlign: "right" }}>
                          {formatUnit(unitVal)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#64748B" }}>
                          {entry.product_code}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
