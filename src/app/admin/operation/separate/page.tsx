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

type ProductUnits = {
  box_unit: number;    // 센터발주입수 (박스입수)
  picking_unit: number; // 센터피킹입수 (피킹입수)
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

// 피킹셀 00-00-000 형식 포맷 (숫자만 추출 → 7자리 패딩 → XX-XX-XXX)
function formatPickingCell(cell: string): string {
  if (!cell) return "-";
  const digits = cell.replace(/\D/g, "").padStart(7, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 7)}`;
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
  const [unitsMap, setUnitsMap] = useState<Record<string, ProductUnits>>({});
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

        // 집계 + 셀 + 마스터입수 병렬 읽기
        let entriesRes = fetch("/api/admin/separate-qty?all=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const unitsRes = fetch("/api/admin/workcenter-product-units", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const [eRes, uRes] = await Promise.all([entriesRes, unitsRes]);
        if (!eRes.ok) { setError("데이터를 불러오지 못했습니다."); return; }

        let payload = (await eRes.json()) as { ok: boolean; entries?: SeparateEntry[]; cells?: Record<string, string>; needsRebuild?: boolean };
        const unitsPayload = uRes.ok ? (await uRes.json()) as { units?: Record<string, ProductUnits> } : { units: {} };

        // 집계 없음 → rebuild 요청 (한 번만)
        if (payload.needsRebuild) {
          const rebuildRes = await fetch("/api/admin/separate-qty?all=1&rebuild=1", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (rebuildRes.ok) payload = (await rebuildRes.json()) as typeof payload;
        }

        const loaded = payload.entries ?? [];
        setEntries(loaded);
        setCellMap(payload.cells ?? {});
        setUnitsMap(unitsPayload.units ?? {});
        const dm: Record<string, boolean> = {};
        for (const e of loaded) { if (e.done) dm[doneKey(e)] = true; }
        setDoneMap(dm);
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

  function handlePrint() {
    window.onafterprint = () => {
      window.onafterprint = null;
      // 인쇄된 항목(출고완료 미체크) 전체를 출고완료 처리
      const toPrint = printGroups.flatMap((g) => g.rows);
      if (toPrint.length === 0) return;
      // 낙관적 업데이트
      setDoneMap((prev) => {
        const next = { ...prev };
        for (const e of toPrint) next[doneKey(e)] = true;
        return next;
      });
      // 서버 저장 (순차 처리)
      void (async () => {
        try {
          const token = await getAdminToken();
          for (const e of toPrint) {
            await fetch("/api/admin/separate-qty", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ date: e.date, store_code: e.store_code, product_code: e.product_code, done: true }),
            });
          }
        } catch {
          // 실패 시 롤백
          setDoneMap((prev) => {
            const next = { ...prev };
            for (const e of toPrint) delete next[doneKey(e)];
            return next;
          });
        }
      })();
    };
    window.print();
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
      const primaryCmp = sortDir === "asc" ? cmp : -cmp;
      // 1순위 동일 시 피킹셀 오름차순 보조 정렬 (방향 고정)
      if (primaryCmp === 0 && sortKey !== "picking_cell") {
        return (cellMap[a.product_code] ?? "").localeCompare(cellMap[b.product_code] ?? "", "ko", { numeric: true });
      }
      return primaryCmp;
    });
  }, [entries, cellMap, sortKey, sortDir]);

  // 인쇄 대상: 출고완료 제외, 점포코드 오름차순 → 피킹셀 오름차순
  const printGroups = useMemo(() => {
    const filtered = [...entries]
      .filter((e) => !(doneMap[doneKey(e)] ?? false))
      .sort((a, b) => {
        const sc = a.store_code.localeCompare(b.store_code);
        if (sc !== 0) return sc;
        return (cellMap[a.product_code] ?? "").localeCompare(cellMap[b.product_code] ?? "", "ko", { numeric: true });
      });

    // 점포별 그룹핑 (삽입 순서 유지)
    const map = new Map<string, { store_code: string; store_name: string; rows: typeof filtered }>();
    for (const e of filtered) {
      if (!map.has(e.store_code)) map.set(e.store_code, { store_code: e.store_code, store_name: e.store_name, rows: [] });
      map.get(e.store_code)!.rows.push(e);
    }
    return Array.from(map.values());
  }, [entries, doneMap, cellMap]);

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
    <>
      {/* ── 인쇄 스타일 ── */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }

          /* 레이아웃 네비게이션 숨김 */
          .ha-admin-header { display: none !important; }

          /* 화면 UI 전체 숨김 */
          .no-print-wrapper { display: none !important; }

          /* 인쇄 전용 테이블 표시 */
          .print-only { display: block !important; }

          /* 행 잘림 방지 */
          tr { page-break-inside: avoid; }

          /* 헤더 페이지마다 반복 */
          thead { display: table-header-group; }

          body { margin: 0; padding: 0; }
        }

        .print-only { display: none; }
      `}</style>

      {/* ── 인쇄 전용 레이아웃 (no-print-wrapper 밖에 위치) ── */}
      <div className="print-only">
        {printGroups.length === 0 ? (
          <p style={{ textAlign: "center", fontSize: 13 }}>출력할 데이터가 없습니다.</p>
        ) : (
          printGroups.map((group, gi) => {
            // 점포 합계
            let totalQtyG = 0, totalBoxQty = 0, totalRemainQty = 0;
            for (const e of group.rows) {
              const bu = unitsMap[e.product_code]?.box_unit ?? 0;
              const bq = bu > 0 ? Math.floor(e.qty / bu) : 0;
              const rq = bu > 0 ? e.qty - bq * bu : 0;
              totalQtyG += e.qty;
              totalBoxQty += bq;
              totalRemainQty += rq;
            }
            const isLast = gi === printGroups.length - 1;
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const printedAt = `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            return (
              <div
                key={group.store_code}
                style={{ pageBreakAfter: isLast ? "auto" : "always" }}
              >
                {/* 타이틀 */}
                <div style={{ textAlign: "center", marginBottom: 56 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>별도작업 Picking List</h1>
                </div>

                {/* 점포 헤더 */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: "2px solid #333",
                  padding: "6px 2px 8px", fontSize: 13, fontWeight: 700, marginBottom: 6,
                }}>
                  <div style={{ display: "flex", gap: 28 }}>
                    <span>출고일: {today}</span>
                    <span>점포코드: {group.store_code}</span>
                    <span>점포명: {group.store_name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>일자: {printedAt}</span>
                </div>

                {/* 상품 테이블 */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #333", height: 32 }}>
                      {["피킹셀", "상품코드", "상품명", "박스입수", "피킹입수", "출고수량", "박스수량", "배수수량", "확인"].map((label) => (
                        <th key={label} style={{ padding: "5px 8px", textAlign: "center", verticalAlign: "middle", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((entry, i) => {
                      const units = unitsMap[entry.product_code];
                      const boxUnit = units?.box_unit ?? 0;
                      const pickingUnit = units?.picking_unit ?? entry.center_unit ?? 0;
                      const boxQty = boxUnit > 0 ? Math.floor(entry.qty / boxUnit) : 0;
                      const remainQty = boxUnit > 0 ? entry.qty - boxQty * boxUnit : 0;
                      const pickingCell = cellMap[entry.product_code] ?? "";
                      return (
                        <tr key={`${entry.store_code}-${entry.product_code}-${i}`} style={{ borderBottom: "1px solid #ddd" }}>
                          <td style={{ padding: "6px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>{formatPickingCell(pickingCell)}</td>
                          <td style={{ padding: "6px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>{entry.product_code}</td>
                          <td style={{ padding: "6px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>{entry.product_name}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}>{boxUnit > 0 ? formatNumber(boxUnit) : "-"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}>{pickingUnit > 0 ? formatNumber(pickingUnit) : "-"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}>{entry.qty > 0 ? formatNumber(entry.qty) : "-"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", fontWeight: 700, whiteSpace: "nowrap" }}>{boxUnit > 0 ? (boxQty > 0 ? formatNumber(boxQty) : "-") : "-"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "middle", fontWeight: 700, whiteSpace: "nowrap" }}>{boxUnit > 0 ? (remainQty > 0 ? formatNumber(remainQty) : "-") : "-"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #333", borderBottom: "2px solid #333", fontWeight: 700 }}>
                      <td colSpan={5} style={{ padding: "6px 8px", textAlign: "right" }}>합계</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>{totalQtyG > 0 ? formatNumber(totalQtyG) : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>{totalBoxQty > 0 ? formatNumber(totalBoxQty) : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{totalRemainQty > 0 ? formatNumber(totalRemainQty) : "-"}</td>
                      <td style={{ padding: "6px 8px" }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })
        )}
      </div>

      {/* ── 화면 UI ── */}
      <div style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }} className="no-print-wrapper">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>별도작업</h1>
            <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>단품별 페이지에서 입력된 별도수량 내역입니다.</p>
          </div>
          <button
            onClick={handlePrint}
            style={{
              padding: "8px 18px",
              background: "#1D4ED8",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginTop: 4,
            }}
          >
            인쇄
          </button>
        </div>
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
    </>
  );
}
