"use client";

import React, { useEffect, useMemo, useState } from "react";

type StoreRow = {
  store_code: string;
  store_name: string;
  car_no: string | null;
  seq_no: number | null;
  is_inspection: boolean | null;
};

function normalizeStoreCode(v: any) {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

export default function InspectionStoresPage() {
  // ✅ 상단(로고/메뉴바) 높이만큼 아래에서 sticky 되도록
  // 보통 56~72 사이가 맞음. 지금 화면 기준 60이 무난.
  const TOPBAR_OFFSET = 60;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<StoreRow[]>([]);
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set());

  // filters
  const [mode, setMode] = useState<"all" | "inspection">("all");
  const [carFilter, setCarFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const changedCount = dirtySet.size;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/inspection-stores/list", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.message || "목록 로드 실패");

      setRows((json.rows ?? []) as StoreRow[]);
      setDirtySet(new Set());
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = String(r.car_no ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (mode === "inspection" && !r.is_inspection) return false;
      if (carFilter !== "all") {
        const c = String(r.car_no ?? "").trim();
        if (c !== carFilter) return false;
      }
      if (!qq) return true;
      const code = String(r.store_code ?? "").toLowerCase();
      const name = String(r.store_name ?? "").toLowerCase();
      return code.includes(qq) || name.includes(qq);
    });
  }, [rows, mode, carFilter, q]);

  const setRowInspection = (store_code: string, checked: boolean) => {
    const code = normalizeStoreCode(store_code);

    setRows((prev) =>
      prev.map((r) => (r.store_code === code ? { ...r, is_inspection: checked } : r))
    );

    setDirtySet((prev) => {
      const next = new Set(prev);
      next.add(code);
      return next;
    });
  };

  const checkAllCurrent = () => {
    const codes = new Set(filtered.map((r) => r.store_code));
    setRows((prev) => prev.map((r) => (codes.has(r.store_code) ? { ...r, is_inspection: true } : r)));
    setDirtySet((prev) => {
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.store_code));
      return next;
    });
  };

  const uncheckAllCurrent = () => {
    const codes = new Set(filtered.map((r) => r.store_code));
    setRows((prev) => prev.map((r) => (codes.has(r.store_code) ? { ...r, is_inspection: false } : r)));
    setDirtySet((prev) => {
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.store_code));
      return next;
    });
  };

  const save = async () => {
    if (saving) return;

    const codes = rows.filter((r) => !!r.is_inspection).map((r) => r.store_code);
    if (!confirm(`저장할까요?\n\n선택된 검수점포: ${codes.length}개`)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/inspection-stores/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.message || "저장 실패");

      setDirtySet(new Set());
      alert(`저장 완료! (검수점포 ${codes.length}개)`);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const btnBase: React.CSSProperties = {
    height: 36, padding: "0 14px", borderRadius: 7, border: "1px solid #D1D9E0",
    background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13,
    cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0,
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto", fontFamily: "Pretendard, system-ui, -apple-system, sans-serif", color: "#1E293B" }}>

      {/* ── 헤더 ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A" }}>검수점포 관리</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94A3B8" }}>체크박스로 검수점포를 켜고 끌 수 있습니다. 변경 후 저장 버튼을 눌러주세요.</p>
      </div>

      {/* sticky 깨짐 방지: 부모에 overflow 없음 */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E8EDF2", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>

        {/* ── 스티키 툴바 ── */}
        <div style={{ position: "sticky", top: TOPBAR_OFFSET, zIndex: 20, background: "#fff", borderBottom: "1px solid #EEF2F7", borderRadius: "10px 10px 0 0" }}>
          <div style={{ padding: "14px 18px" }}>

            {/* 필터 행 */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* 전체 / 검수만 토글 */}
              <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
                {(["all", "inspection"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    height: 32, padding: "0 14px", borderRadius: 6, border: "none",
                    background: mode === m ? "#1E293B" : "transparent",
                    color: mode === m ? "#fff" : "#64748B",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>
                    {m === "all" ? "전체" : "검수만"}
                  </button>
                ))}
              </div>

              <select
                value={carFilter}
                onChange={(e) => setCarFilter(e.target.value)}
                style={{ height: 38, borderRadius: 7, border: "1px solid #D1D9E0", padding: "0 12px", fontSize: 13, fontWeight: 700, color: "#374151", background: "#fff", flexShrink: 0, outline: "none" }}
              >
                <option value="all">전체 호차</option>
                {carOptions.map((c) => <option key={c} value={c}>{c}호차</option>)}
              </select>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="점포코드 / 점포명 검색"
                style={{ height: 38, borderRadius: 7, border: "1px solid #D1D9E0", padding: "0 12px", fontSize: 13, outline: "none", flex: 1, minWidth: 200, color: "#1E293B" }}
              />

              {/* 저장 버튼 */}
              <button
                onClick={save}
                disabled={saving || changedCount === 0}
                style={{
                  height: 38, padding: "0 20px", borderRadius: 7, border: "none",
                  background: changedCount > 0 && !saving ? "#1E293B" : "#E2E8F0",
                  color: changedCount > 0 && !saving ? "#fff" : "#94A3B8",
                  fontWeight: 700, fontSize: 13, cursor: changedCount === 0 || saving ? "not-allowed" : "pointer",
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                {saving ? "저장 중..." : changedCount > 0 ? `저장 (${changedCount}건)` : "저장"}
              </button>
            </div>

            {/* 액션 행 */}
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <button onClick={checkAllCurrent} style={btnBase}>현재 목록 전체 체크</button>
              <button onClick={uncheckAllCurrent} style={btnBase}>현재 목록 전체 해제</button>
              <button onClick={load} disabled={loading} style={{ ...btnBase, opacity: loading ? 0.5 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "불러오는 중..." : "새로고침"}
              </button>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8" }}>
                표시 <b style={{ color: "#475569" }}>{filtered.length}</b>건 · 전체 <b style={{ color: "#475569" }}>{rows.length}</b>건
                {changedCount > 0 && <> · 변경 <b style={{ color: "#B45309" }}>{changedCount}</b>건</>}
              </div>
            </div>
          </div>
        </div>

        {/* ── 테이블 (스크롤 영역) ── */}
        <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto", borderRadius: "0 0 10px 10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {[
                  { label: "호차", w: 80 },
                  { label: "순번", w: 70 },
                  { label: "점포코드", w: 110 },
                  { label: "점포명", w: undefined },
                  { label: "검수", w: 100 },
                ].map(({ label, w }) => (
                  <th key={label} style={{ textAlign: "left", padding: "10px 14px", borderBottom: "2px solid #E8EDF2", fontSize: 12, fontWeight: 700, color: "#64748B", width: w, whiteSpace: "nowrap" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                    {loading ? "불러오는 중..." : "표시할 데이터가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const checked = !!r.is_inspection;
                  const code = normalizeStoreCode(r.store_code);
                  const isDirty = dirtySet.has(code);
                  return (
                    <tr key={code} style={{ borderBottom: "1px solid #F1F5F9", background: checked ? "#FAFEFF" : "#fff" }}>
                      <td style={{ padding: "10px 14px", color: "#64748B", whiteSpace: "nowrap" }}>{String(r.car_no ?? "-")}</td>
                      <td style={{ padding: "10px 14px", color: "#94A3B8", whiteSpace: "nowrap" }}>{r.seq_no ?? "-"}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap" }}>
                        {code}
                        {isDirty && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", display: "inline-block", verticalAlign: "middle" }} />}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>{r.store_name}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
                          <div style={{
                            width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                            background: checked ? "#0EA5E9" : "#D1D9E0",
                            position: "relative", transition: "background 0.15s", cursor: "pointer",
                          }}>
                            <input type="checkbox" checked={checked} onChange={(e) => setRowInspection(code, e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                            <div style={{
                              position: "absolute", top: 3, left: checked ? 21 : 3,
                              width: 16, height: 16, borderRadius: "50%", background: "#fff",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.18)", transition: "left 0.15s",
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: checked ? "#0369A1" : "#94A3B8" }}>
                            {checked ? "검수" : "미검수"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
