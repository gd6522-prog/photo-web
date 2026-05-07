"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  picking_cell: string;
  product_code: string;
  product_name: string;
  box_unit: number;
  picking_unit: number;
  expiry_date: string;
  computed_qty: number;
  box_count: number;
  unit_count: number;
  unit_cost: number;
};

type SavedRecord = {
  product_code: string;
  expiry_date: string;
  work_part: string;
  saved_at: string;
  computed_qty: number;
  box_count: number;
  unit_count: number;
  box_unit: number;
  picking_unit: number;
  unit_cost: number;
  product_name: string;
  picking_cell: string;
  actual_expiry_date: string;
  actual_box_count: number;
  actual_unit_count: number;
};

const recordKey = (code: string, expiry: string) => `${code}|${expiry}`;

type WorkPartKey =
  | "box_manual"
  | "box_zone"
  | "inner_zone"
  | "slide_zone"
  | "light_zone"
  | "irregular_zone"
  | "tobacco_zone"
  | "etc";

const TABS: { key: WorkPartKey; label: string; ready: boolean }[] = [
  { key: "box_manual", label: "박스수기", ready: true },
  { key: "box_zone", label: "박스존", ready: true },
  { key: "inner_zone", label: "이너존", ready: true },
  { key: "slide_zone", label: "슬라존", ready: true },
  { key: "light_zone", label: "경량존", ready: true },
  { key: "irregular_zone", label: "이형존", ready: true },
  { key: "tobacco_zone", label: "담배존", ready: true },
  { key: "etc", label: "그외", ready: true },
];

function formatPickingCell(cell: string): string {
  if (!cell) return "-";
  const digits = cell.replace(/\D/g, "");
  if (!digits) return cell;
  const padded = digits.padStart(7, "0");
  return `${padded.slice(0, 2)}-${padded.slice(2, 4)}-${padded.slice(4, 7)}`;
}

async function getAdminToken(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("로그인 세션이 없습니다.");
}

export default function InventoryCheckPage() {
  const [tab, setTab] = useState<WorkPartKey>("box_manual");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedMap, setSavedMap] = useState<Map<string, SavedRecord>>(new Map());
  const [actuals, setActuals] = useState<Map<string, { expiry: string; box: string; unit: string }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // 드래그 상태: anchor 부터 현재 idx 까지 범위만 mode 적용, 그 외는 initialSet 으로 되돌림
  const dragRef = useRef<{
    active: boolean;
    mode: "add" | "remove";
    anchor: number;
    initialSet: Set<number>;
  }>({ active: false, mode: "add", anchor: -1, initialSet: new Set() });
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const scrollRafRef = useRef<number | null>(null);

  const applyDragRange = (idx: number) => {
    if (!dragRef.current.active) return;
    const { mode, anchor, initialSet } = dragRef.current;
    const lo = Math.min(anchor, idx);
    const hi = Math.max(anchor, idx);
    const next = new Set(initialSet);
    for (let i = lo; i <= hi; i++) {
      if (mode === "add") next.add(i);
      else next.delete(i);
    }
    setSelected(next);
  };

  const updateFromCursor = () => {
    const el = document.elementFromPoint(cursorRef.current.x, cursorRef.current.y);
    if (!el) return;
    const tr = (el as HTMLElement).closest("tr[data-row-idx]") as HTMLElement | null;
    if (!tr) return;
    const idx = Number(tr.dataset.rowIdx);
    if (!Number.isFinite(idx)) return;
    applyDragRange(idx);
  };

  const stopAutoScroll = () => {
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  };

  const startAutoScroll = () => {
    if (scrollRafRef.current != null) return;
    const tick = () => {
      if (!dragRef.current.active) {
        scrollRafRef.current = null;
        return;
      }
      const y = cursorRef.current.y;
      const vh = window.innerHeight;
      const edge = 80;
      let dy = 0;
      if (y < edge) dy = -Math.ceil((edge - y) / 6 + 1); // 위로
      else if (y > vh - edge) dy = Math.ceil((y - (vh - edge)) / 6 + 1); // 아래로
      if (dy !== 0) {
        window.scrollBy(0, dy);
        updateFromCursor();
        scrollRafRef.current = window.requestAnimationFrame(tick);
      } else {
        scrollRafRef.current = null;
      }
    };
    scrollRafRef.current = window.requestAnimationFrame(tick);
  };

  // 글로벌 mouseup / mousemove 핸들러
  useEffect(() => {
    const onUp = () => {
      dragRef.current.active = false;
      stopAutoScroll();
    };
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (!dragRef.current.active) return;
      // 커서 위치의 행과 동기화 (마우스 이동 시 mouseenter 누락 방지)
      updateFromCursor();
      const vh = window.innerHeight;
      const edge = 80;
      if (e.clientY < edge || e.clientY > vh - edge) startAutoScroll();
      else stopAutoScroll();
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mouseleave", onUp);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mouseleave", onUp);
      window.removeEventListener("mousemove", onMove);
      stopAutoScroll();
    };
  }, []);

  // 인쇄 끝나면 '선택 인쇄' 모드 자동 해제
  useEffect(() => {
    const onAfter = () => setPrintSelectedOnly(false);
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, []);

  const toggleRow = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleRowMouseDown = (idx: number) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const initial = new Set(selected);
    const willAdd = !initial.has(idx);
    dragRef.current = {
      active: true,
      mode: willAdd ? "add" : "remove",
      anchor: idx,
      initialSet: initial,
    };
    // 시작 행 즉시 토글
    const next = new Set(initial);
    if (willAdd) next.add(idx);
    else next.delete(idx);
    setSelected(next);
  };

  const handleRowMouseEnter = (idx: number) => () => {
    if (!dragRef.current.active) return;
    applyDragRange(idx);
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;
  const headerCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((_, i) => i)));
  };

  // 탭 변경하거나 데이터 새로 로드되면 선택 초기화
  useEffect(() => {
    setSelected(new Set());
  }, [tab, rows]);

  const load = React.useCallback(async (part: WorkPartKey) => {
    try {
      setLoading(true);
      setError("");
      const token = await getAdminToken();
      const [rowsRes, recRes] = await Promise.all([
        fetch(`/api/admin/inventory-check?part=${encodeURIComponent(part)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`/api/admin/inventory-check-records?part=${encodeURIComponent(part)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const rowsPayload = (await rowsRes.json()) as { ok?: boolean; message?: string; rows?: Row[] };
      if (!rowsRes.ok || !rowsPayload.ok) {
        setError(rowsPayload.message || "데이터를 불러오지 못했습니다.");
        setRows([]);
        return;
      }
      setRows(rowsPayload.rows ?? []);

      const recPayload = (await recRes.json().catch(() => ({}))) as { ok?: boolean; records?: SavedRecord[] };
      const map = new Map<string, SavedRecord>();
      const actualMap = new Map<string, { expiry: string; box: string; unit: string }>();
      for (const r of recPayload.records ?? []) {
        const k = recordKey(r.product_code, r.expiry_date);
        map.set(k, r);
        actualMap.set(k, {
          expiry: r.actual_expiry_date,
          box: r.actual_box_count ? String(r.actual_box_count) : "",
          unit: r.actual_unit_count ? String(r.actual_unit_count) : "",
        });
      }
      setSavedMap(map);
      setActuals(actualMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const totals = useMemo(() => {
    let qty = 0;
    let box = 0;
    let unit = 0;
    for (const r of rows) {
      qty += r.computed_qty;
      box += r.box_count;
      unit += r.unit_count;
    }
    return { qty, box, unit, count: rows.length };
  }, [rows]);

  const todayKstStr = useMemo(() => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const [printSelectedOnly, setPrintSelectedOnly] = useState(false);

  const onPrintAll = () => {
    setPrintSelectedOnly(false);
    window.setTimeout(() => window.print(), 0);
  };
  const onPrintSelected = () => {
    if (selected.size === 0) return;
    setPrintSelectedOnly(true);
    window.setTimeout(() => window.print(), 0);
  };

  // ── 실사 입력 / 저장 / 초기화 ──────────────────────────────────────
  const updateActual = (key: string, field: "expiry" | "box" | "unit", value: string) => {
    setActuals((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { expiry: "", box: "", unit: "" };
      next.set(key, { ...cur, [field]: value });
      return next;
    });
  };

  const onSave = async () => {
    if (saving) return;
    const dirty: Array<Parameters<typeof JSON.stringify>[0]> = [];
    for (const r of rows) {
      const k = recordKey(r.product_code, r.expiry_date);
      const a = actuals.get(k);
      if (!a) continue;
      const hasInput = (a.expiry && a.expiry.trim()) || a.box || a.unit;
      if (!hasInput) continue;
      const saved = savedMap.get(k);
      const base = saved ?? r;
      dirty.push({
        product_code: r.product_code,
        expiry_date: r.expiry_date,
        product_name: base.product_name,
        picking_cell: base.picking_cell,
        box_unit: base.box_unit,
        picking_unit: base.picking_unit,
        computed_qty: base.computed_qty,
        box_count: base.box_count,
        unit_count: base.unit_count,
        unit_cost: base.unit_cost,
        actual_expiry_date: a.expiry || "",
        actual_box_count: parseFloat(a.box) || 0,
        actual_unit_count: parseFloat(a.unit) || 0,
      });
    }
    if (dirty.length === 0) {
      alert("실사 입력이 있는 행이 없습니다.");
      return;
    }
    setSaving(true);
    try {
      const token = await getAdminToken();
      const res = await fetch("/api/admin/inventory-check-records", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ part: tab, rows: dirty }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !payload.ok) {
        alert(payload.message || `저장 실패 (${res.status})`);
        return;
      }
      await load(tab);
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!confirm("저장된 모든 실사 기록을 초기화합니다. 월 마감 후가 아니라면 신중히 진행해 주세요. 계속할까요?")) return;
    const token = await getAdminToken();
    const res = await fetch("/api/admin/inventory-check-records", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { message?: string }).message || "초기화 실패");
      return;
    }
    await load(tab);
  };

  return (
    <div className={`ic-page${printSelectedOnly ? " ic-print-selected-only" : ""}`} style={{ display: "grid", gap: 12 }}>
      <div className="ic-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0f172a" }}>재고조사</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => void load(tab)}
            disabled={loading}
            style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            style={{
              ...btnStyle,
              background: "#0369a1",
              color: "#fff",
              borderColor: "#0369a1",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            onClick={() => void onReset()}
            style={{ ...btnStyle, background: "#fff", color: "#b91c1c", borderColor: "#fecaca" }}
          >
            초기화
          </button>
          <button
            type="button"
            onClick={onPrintSelected}
            disabled={selected.size === 0}
            style={{
              ...btnStyle,
              background: selected.size > 0 ? "#1d4ed8" : "#94a3b8",
              color: "#fff",
              borderColor: selected.size > 0 ? "#1d4ed8" : "#94a3b8",
              cursor: selected.size > 0 ? "pointer" : "not-allowed",
            }}
          >
            선택 인쇄 ({selected.size})
          </button>
          <button type="button" onClick={onPrintAll} style={{ ...btnStyle, background: "#0f766e", color: "#fff", borderColor: "#0f766e" }}>
            전체 인쇄
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="ic-tabs" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid #cbd5e1" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => t.ready && setTab(t.key)}
              disabled={!t.ready}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 700,
                background: active ? "#0f172a" : "transparent",
                color: active ? "#fff" : t.ready ? "#475569" : "#94a3b8",
                border: "1px solid",
                borderColor: active ? "#0f172a" : "#e2e8f0",
                borderBottom: active ? "1px solid #0f172a" : "none",
                borderRadius: "6px 6px 0 0",
                cursor: t.ready ? "pointer" : "default",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="ic-summary" style={{ fontSize: 12, color: "#475569" }}>
        총 {totals.count.toLocaleString()}건 / 전산수량 합계 {totals.qty.toLocaleString()}
      </div>

      <div style={{ border: "1px solid #cbd5e1", background: "#fff", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <colgroup>
            <col className="ic-select-col" style={{ width: 36 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            {/* 인쇄용 페이지 상단 헤더 — 페이지마다 반복 (thead 가 자동으로 반복됨) */}
            <tr className="ic-print-header" style={{ display: "none" }}>
              <th
                colSpan={13}
                style={{
                  border: "1px solid #cbd5e1",
                  padding: "10px 12px",
                  textAlign: "left",
                  fontSize: 14,
                  fontWeight: 800,
                  background: "#fff",
                  color: "#0f172a",
                }}
              >
                {todayKstStr} 정기 재고실사
              </th>
              <th
                colSpan={5}
                style={{
                  border: "1px solid #cbd5e1",
                  padding: "10px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#fff",
                  color: "#0f172a",
                  textAlign: "left",
                }}
              >
                실사자 서명:
              </th>
            </tr>
            <tr style={{ background: "#f1f5f9" }}>
              <th className="ic-select-col" style={th}>
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ cursor: "pointer" }}
                  aria-label="전체 선택"
                />
              </th>
              <th style={th}>피킹셀</th>
              <th style={th}>상품코드</th>
              <th style={th}>상품명</th>
              <th style={th}>박스<br />입수</th>
              <th style={th}>피킹<br />입수</th>
              <th style={th}>전산<br />소비기한</th>
              <th style={th}>전산<br />수량</th>
              <th style={th}>박스<br />수량</th>
              <th style={th}>낱개<br />수량</th>
              <th style={{ ...th, background: "#fef3c7" }}>실사<br />유통기한</th>
              <th style={{ ...th, background: "#fef3c7" }}>실사<br />박스</th>
              <th style={{ ...th, background: "#fef3c7" }}>실사<br />낱개</th>
              <th style={th}>실사<br />수량</th>
              <th style={th}>재고<br />조사일</th>
              <th style={th}>매입<br />원가</th>
              <th style={th}>차이<br />수량</th>
              <th style={th}>차이<br />금액</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={18} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={18} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const isSel = selected.has(idx);
                const key = recordKey(r.product_code, r.expiry_date);
                const saved = savedMap.get(key);
                const dispBoxUnit = saved ? saved.box_unit : r.box_unit;
                const dispPickUnit = saved ? saved.picking_unit : r.picking_unit;
                const dispExpiry = saved ? saved.expiry_date : r.expiry_date;
                const dispComputedQty = saved ? saved.computed_qty : r.computed_qty;
                const dispBoxCount = saved ? saved.box_count : r.box_count;
                const dispUnitCount = saved ? saved.unit_count : r.unit_count;
                const dispCost = saved ? saved.unit_cost : r.unit_cost;

                const a = actuals.get(key) ?? { expiry: "", box: "", unit: "" };
                const aBox = parseFloat(a.box) || 0;
                const aUnit = parseFloat(a.unit) || 0;
                const aQty = aBox * dispBoxUnit + aUnit * dispPickUnit;
                const hasInput = (a.expiry && a.expiry.trim() !== "") || a.box !== "" || a.unit !== "";
                const diffQty = hasInput ? aQty - dispComputedQty : 0;
                const diffAmount = hasInput ? diffQty * dispCost : 0;
                const savedDateStr = saved?.saved_at ? new Date(saved.saved_at).toLocaleDateString("ko-KR") : "";

                return (
                  <tr
                    key={`${r.product_code}-${r.expiry_date}-${idx}`}
                    data-selected={isSel ? "1" : "0"}
                    data-row-idx={idx}
                    onMouseDown={handleRowMouseDown(idx)}
                    onMouseEnter={handleRowMouseEnter(idx)}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      background: isSel ? "#dbeafe" : saved ? "#f0fdf4" : undefined,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <td className="ic-select-col" style={tdC}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        readOnly
                        tabIndex={-1}
                        onClick={(e) => e.preventDefault()}
                        style={{ pointerEvents: "none" }}
                      />
                    </td>
                    <td style={tdC}>{formatPickingCell(r.picking_cell)}</td>
                    <td style={tdC}>{r.product_code}</td>
                    <td style={tdName} title={r.product_name || ""}>{r.product_name || "-"}</td>
                    <td style={tdR}>{dispBoxUnit ? dispBoxUnit.toLocaleString() : "-"}</td>
                    <td style={tdR}>{dispPickUnit ? dispPickUnit.toLocaleString() : "-"}</td>
                    <td style={tdC}>{dispExpiry || "-"}</td>
                    <td style={tdR}>{dispComputedQty ? dispComputedQty.toLocaleString() : "-"}</td>
                    <td style={tdR}>{dispBoxCount ? dispBoxCount.toLocaleString() : "-"}</td>
                    <td style={tdR}>{dispUnitCount ? dispUnitCount.toLocaleString() : "-"}</td>
                    <td style={{ ...tdC, padding: 2, background: "#fffbeb" }} onMouseDown={(e) => e.stopPropagation()}>
                      <input
                        type="date"
                        value={a.expiry}
                        onChange={(e) => updateActual(key, "expiry", e.target.value)}
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ ...tdR, padding: 2, background: "#fffbeb" }} onMouseDown={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        value={a.box}
                        onChange={(e) => updateActual(key, "box", e.target.value)}
                        style={inputStyleNum}
                      />
                    </td>
                    <td style={{ ...tdR, padding: 2, background: "#fffbeb" }} onMouseDown={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        value={a.unit}
                        onChange={(e) => updateActual(key, "unit", e.target.value)}
                        style={inputStyleNum}
                      />
                    </td>
                    <td style={tdR}>{hasInput && aQty ? aQty.toLocaleString() : "-"}</td>
                    <td style={tdC}>{savedDateStr || "-"}</td>
                    <td style={tdR}>{dispCost ? dispCost.toLocaleString() : "-"}</td>
                    <td style={{ ...tdR, color: hasInput && diffQty < 0 ? "#b91c1c" : hasInput && diffQty > 0 ? "#0369a1" : undefined }}>
                      {hasInput ? diffQty.toLocaleString() : "-"}
                    </td>
                    <td style={{ ...tdR, color: hasInput && diffAmount < 0 ? "#b91c1c" : hasInput && diffAmount > 0 ? "#0369a1" : undefined }}>
                      {hasInput ? Math.round(diffAmount).toLocaleString() : "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        /* 선택된 행은 배경이 연파랑이라 기본 #e2e8f0 테두리가 사라져 보임 — 더 진한 색으로 강제 */
        .ic-page tbody tr[data-selected="1"] td {
          border-color: #94a3b8 !important;
        }
        @media print {
          /* admin layout 의 상단 nav (메인/사진/운영 등) 숨김 */
          .ha-admin-header,
          header,
          nav {
            display: none !important;
          }
          .ic-toolbar,
          .ic-tabs,
          .ic-summary {
            display: none !important;
          }
          .ic-page {
            margin: 0 !important;
            padding: 0 !important;
          }
          .ic-page table {
            font-size: 10px;
            border-collapse: collapse !important;
          }
          /* 인쇄지의 표 구분선 — 모든 셀(th/td)을 동일한 1px solid #111 로 강제.
             border 단축속성으로 덮어써서 인라인 border 색이 남지 않게 함. */
          .ic-page table th,
          .ic-page table td {
            border: 1px solid #111 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* thead 가 각 페이지 상단에 반복되도록 */
          .ic-page thead {
            display: table-header-group !important;
          }
          /* 인쇄 페이지 상단 헤더 (오늘날짜 + 정기 재고실사 + 실사자 서명) 노출 */
          .ic-print-header {
            display: table-row !important;
          }
          /* 행이 페이지 가운데서 잘리지 않도록 */
          .ic-page tbody tr {
            page-break-inside: avoid;
          }
          /* 선택 컬럼 (체크박스) 은 인쇄에서 항상 숨김 */
          .ic-page .ic-select-col {
            display: none !important;
          }
          /* '선택 인쇄' 모드일 때만 선택되지 않은 행 숨김 */
          .ic-print-selected-only tbody tr[data-selected="0"] {
            display: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }
        /* 인쇄 후 모드 자동 해제 — afterprint 이벤트로 컴포넌트가 처리하지만 안전망으로 인쇄 종료 후 클래스 효과 사라지게 */
      `}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid #cbd5f5",
  background: "#fff",
  color: "#1f2a44",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const th: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  padding: "6px 4px",
  fontSize: 12,
  fontWeight: 700,
  color: "#0f172a",
  textAlign: "center",
  background: "#f1f5f9",
};

const td: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "5px 6px",
  fontSize: 12,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const tdC: React.CSSProperties = { ...td, textAlign: "center" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
const tdName: React.CSSProperties = { ...td, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 };

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 26,
  padding: "0 4px",
  border: "1px solid #cbd5e1",
  borderRadius: 3,
  fontSize: 11,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
};

const inputStyleNum: React.CSSProperties = { ...inputStyle, textAlign: "right" };
