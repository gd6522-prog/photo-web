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

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ padding: "10px 4px 14px" }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "#111827" }}>검수점포 최신화</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>
          체크박스로 검수점포(is_inspection)를 상시로 켜고 끌 수 있어요.
        </div>
      </div>

      {/* ✅ 카드(overflow 절대 주지 않음! sticky 깨짐 방지) */}
      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: 0,
          background: "white",
        }}
      >
        {/* ✅ sticky는 여기! (부모에 overflow 없어서 정상 동작) */}
        <div
          style={{
            position: "sticky",
            top: TOPBAR_OFFSET,
            zIndex: 20,
            background: "white",
            borderBottom: "1px solid #E5E7EB",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          <div style={{ padding: 14 }}>
            {/* 1줄: 필터 + 저장(오른쪽 고정, 절대 안 늘어남) */}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <button
                onClick={() => setMode("all")}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 4,
                  border: "1px solid #E5E7EB",
                  background: mode === "all" ? "#111827" : "white",
                  color: mode === "all" ? "white" : "#111827",
                  fontWeight: 900,
                  cursor: "pointer",
                  width: "auto",
                  flexShrink: 0,
                }}
              >
                전체
              </button>

              <button
                onClick={() => setMode("inspection")}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 4,
                  border: "1px solid #E5E7EB",
                  background: mode === "inspection" ? "#111827" : "white",
                  color: mode === "inspection" ? "white" : "#111827",
                  fontWeight: 900,
                  cursor: "pointer",
                  width: "auto",
                  flexShrink: 0,
                }}
              >
                검수만
              </button>

              <select
                value={carFilter}
                onChange={(e) => setCarFilter(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  padding: "0 12px",
                  fontWeight: 800,
                  color: "#111827",
                  background: "white",
                  width: "auto",
                  flexShrink: 0,
                }}
              >
                <option value="all">전체 호차</option>
                {carOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색: 점포코드 / 점포명"
                style={{
                  height: 44,
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  padding: "0 14px",
                  outline: "none",
                  flex: 1,
                  minWidth: 240,
                }}
              />

              {/* 오른쪽 저장 버튼(고정) */}
              <button
                onClick={save}
                disabled={saving || changedCount === 0}
                style={{
                  height: 56,
                  width: 200, // ✅ 고정폭
                  borderRadius: 0,
                  border: "1px solid #111827",
                  background: saving || changedCount === 0 ? "#E5E7EB" : "#F3F4F6",
                  color: "#111827",
                  fontWeight: 900,
                  cursor: saving || changedCount === 0 ? "not-allowed" : "pointer",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={changedCount === 0 ? "변경된 항목이 없습니다" : "저장"}
              >
                {saving ? "저장 중..." : `저장 (${changedCount})`}
              </button>
            </div>

            {/* 2줄: 액션 */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={checkAllCurrent}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  width: "auto",
                }}
              >
                현재 목록 전체 체크
              </button>

              <button
                onClick={uncheckAllCurrent}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  width: "auto",
                }}
              >
                현재 목록 전체 해제
              </button>

              <button
                onClick={load}
                disabled={loading}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: loading ? "not-allowed" : "pointer",
                  width: "auto",
                }}
              >
                {loading ? "불러오는 중..." : "새로고침"}
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
              표시: {filtered.length}건 / 전체: {rows.length}건 / 변경: {changedCount}건
            </div>
          </div>
        </div>

        {/* ✅ 스크롤은 “테이블 영역만” (sticky 깨지지 않게 분리) */}
        <div style={{ maxHeight: "calc(100vh - 220px)", overflow: "auto", borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB", width: 100 }}>
                  호차번호
                </th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB", width: 80 }}>
                  순번
                </th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB", width: 120 }}>
                  점포코드
                </th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>
                  점포명
                </th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB", width: 140 }}>
                  검수
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => {
                const checked = !!r.is_inspection;
                const code = normalizeStoreCode(r.store_code);

                return (
                  <tr key={code} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: 12, whiteSpace: "nowrap" }}>{String(r.car_no ?? "-")}</td>
                    <td style={{ padding: 12, whiteSpace: "nowrap" }}>{r.seq_no ?? "-"}</td>
                    <td style={{ padding: 12, whiteSpace: "nowrap", fontWeight: 900 }}>{code}</td>
                    <td style={{ padding: 12 }}>{r.store_name}</td>

                    {/* ✅ 체크박스 살리고, “점포명에서 너무 멀지 않게” 오른쪽 칸에 */}
                    <td style={{ padding: 12 }}>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 4,
                          border: "1px solid #E5E7EB",
                          background: checked ? "#EFF6FF" : "white",
                          cursor: "pointer",
                          userSelect: "none",
                          fontWeight: 900,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setRowInspection(code, e.target.checked)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                        검수
                      </label>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "#6B7280" }}>
                    표시할 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
