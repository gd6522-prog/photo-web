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
  done?: boolean;
};

type SortKey = "date" | "store_code" | "store_name" | "picking_cell" | "product_code" | "product_name" | "qty" | "separate_unit";
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

function doneKey(entry: SeparateEntry) {
  return `${entry.date}|${entry.store_code}|${entry.product_code}`;
}

export default function SeparatePage() {
  const [entries, setEntries] = useState<SeparateEntry[]>([]);
  const [cellMap, setCellMap] = useState<Record<string, string>>({});
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc"); // 기본: 일자 내림차순

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const token = await getAdminToken();
        const [entriesRes, cellsRes] = await Promise.all([
          fetch("/api/admin/separate-qty?all=1", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch("/api/admin/product-strategy-cells", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);
        if (!entriesRes.ok) {
          setError("데이터를 불러오지 못했습니다.");
          return;
        }
        const payload = (await entriesRes.json()) as { ok: boolean; entries?: SeparateEntry[] };
        const loaded = payload.entries ?? [];
        setEntries(loaded);

        // done 상태 초기화
        const dm: Record<string, boolean> = {};
        for (const e of loaded) {
          if (e.done) dm[doneKey(e)] = true;
        }
        setDoneMap(dm);

        if (cellsRes.ok) {
          const cellPayload = (await cellsRes.json()) as { ok: boolean; cells?: Record<string, string> };
          setCellMap(cellPayload.cells ?? {});
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleDone(entry: SeparateEntry) {
    const key = doneKey(entry);
    const next = !doneMap[key];
    setDoneMap((prev) => ({ ...prev, [key]: next }));
    try {
      const token = await getAdminToken();
      await fetch("/api/admin/separate-qty", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          date: entry.date,
          store_code: entry.store_code,
          product_code: entry.product_code,
          done: next,
        }),
      });
    } catch {
      // 실패 시 롤백
      setDoneMap((prev) => ({ ...prev, [key]: !next }));
    }
  }

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "store_code") cmp = a.store_code.localeCompare(b.store_code);
      else if (sortKey === "store_name") cmp = a.store_name.localeCompare(b.store_name, "ko");
      else if (sortKey === "picking_cell") cmp = (cellMap[a.product_code] ?? "").localeCompare(cellMap[b.product_code] ?? "", "ko", { numeric: true });
      else if (sortKey === "product_code") cmp = a.product_code.localeCompare(b.product_code);
      else if (sortKey === "product_name") cmp = a.product_name.localeCompare(b.product_name, "ko");
      else if (sortKey === "qty") cmp = a.qty - b.qty;
      else if (sortKey === "separate_unit") {
        const av = separateUnit(a) ?? 0;
        const bv = separateUnit(b) ?? 0;
        cmp = av - bv;
      }
      // 1순위 동일 시 피킹셀 오름차순 보조 정렬
      if (cmp === 0 && sortKey !== "picking_cell") {
        cmp = (cellMap[a.product_code] ?? "").localeCompare(cellMap[b.product_code] ?? "", "ko", { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, cellMap, sortKey, sortDir]);

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
    { key: "date",          label: "일자" },
    { key: "store_code",    label: "점포코드" },
    { key: "store_name",    label: "점포명" },
    { key: "picking_cell",  label: "피킹셀" },
    { key: "product_code",  label: "상품코드" },
    { key: "product_name",  label: "상품명" },
    { key: "qty",           label: "별도수량", align: "right" },
    { key: "separate_unit", label: "별도배수", align: "right" },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
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
            {Object.keys(cellMap).length === 0 && (
              <div style={{ fontSize: 12, color: "#F59E0B", fontWeight: 600 }}>
                ⚠ 상품별 전략관리 파일이 없어 피킹셀을 표시할 수 없습니다.
              </div>
            )}
          </div>

          <div style={{ border: "1px solid #E8EDF2", borderRadius: 10, background: "#fff", overflow: "auto", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
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
                  <th style={{ padding: "10px 16px", borderBottom: "2px solid #E8EDF2", fontSize: 12, fontWeight: 700, color: "#64748B", textAlign: "center", whiteSpace: "nowrap" }}>
                    출고완료
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                      등록된 별도수량이 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((entry, i) => {
                    const unitVal = separateUnit(entry);
                    const isDecimal = unitVal !== null && unitVal % 1 !== 0;
                    const pickingCell = cellMap[entry.product_code] ?? "";
                    const isDone = doneMap[doneKey(entry)] ?? false;
                    return (
                      <tr
                        key={`${entry.date}-${entry.store_code}-${entry.product_code}-${i}`}
                        style={{ background: isDone ? "#F0FDF4" : i % 2 === 0 ? "#fff" : "#FAFBFC" }}
                      >
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: isDone ? "#6B7280" : "#374151", whiteSpace: "nowrap" }}>
                          {formatDate(entry.date)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: isDone ? "#9CA3AF" : "#64748B" }}>
                          {entry.store_code}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 600, color: isDone ? "#6B7280" : "#0F172A" }}>
                          {entry.store_name}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: isDone ? "#9CA3AF" : "#374151", whiteSpace: "nowrap" }}>
                          {pickingCell || <span style={{ color: "#CBD5E1" }}>-</span>}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: isDone ? "#9CA3AF" : "#64748B" }}>
                          {entry.product_code}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: isDone ? "#6B7280" : "#374151" }}>
                          {entry.product_name}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 700, color: isDone ? "#9CA3AF" : "#1D4ED8", textAlign: "right" }}>
                          {formatNumber(entry.qty)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 700, color: isDone ? "#9CA3AF" : isDecimal ? "#EF4444" : "#1D4ED8", textAlign: "right" }}>
                          {formatUnit(unitVal)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid #F1F5F9", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => void toggleDone(entry)}
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#16A34A" }}
                          />
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
