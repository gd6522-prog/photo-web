"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Counts = {
  location_missing: number;
  work_type_missing: number;
  work_type_misconfigured: number;
  cell_mismatch: number;
  full_box_missing: number;
  shipment_below_standard: number;
};

type DetailItem = {
  product_code: string;
  product_name?: string;
  picking_cell?: string;
  work_type?: string;
  expected_work_type?: string;
  full_box_yn?: string;
  expiry_date?: string;
  shipment_standard_days?: number;
  cutoff_date?: string;
  qty?: number;
  days_short?: number;
  current_cell?: string;
};

type Details = {
  location_missing: DetailItem[];
  work_type_missing: DetailItem[];
  work_type_misconfigured: DetailItem[];
  cell_mismatch: DetailItem[];
  full_box_missing: DetailItem[];
  shipment_below_standard: DetailItem[];
};

type ItemKey = keyof Counts;

type ChecklistItem = {
  key: ItemKey;
  label: string;
  pending?: boolean;
};

const ITEMS: ChecklistItem[] = [
  { key: "location_missing", label: "피킹셀 미지정" },
  { key: "work_type_missing", label: "작업구분 미지정" },
  { key: "work_type_misconfigured", label: "작업구분 설정오류" },
  { key: "cell_mismatch", label: "현재고 피킹셀 정위치 여부" },
  { key: "full_box_missing", label: "완박스작업 미지정" },
  { key: "shipment_below_standard", label: "출고기준미달" },
];

const NEW_ARRIVAL_KINDS: ItemKey[] = ["location_missing", "work_type_missing"];
const NEW_ARRIVAL_STORAGE_PREFIX = "operation-checklist-new-arrival-";

function getCurrentValidThursday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  const thursday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilThursday);
  const y = thursday.getFullYear();
  const m = String(thursday.getMonth() + 1).padStart(2, "0");
  const d = String(thursday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNewArrivalStorageKey(): string {
  return `${NEW_ARRIVAL_STORAGE_PREFIX}${getCurrentValidThursday()}`;
}

function loadNewArrivalMarks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const currentKey = getNewArrivalStorageKey();
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(NEW_ARRIVAL_STORAGE_PREFIX) && k !== currentKey) stale.push(k);
    }
    stale.forEach((k) => window.localStorage.removeItem(k));
    const raw = window.localStorage.getItem(currentKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveNewArrivalMarks(marks: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const key = getNewArrivalStorageKey();
    window.localStorage.setItem(key, JSON.stringify(Array.from(marks)));
  } catch {
    /* ignore */
  }
}

function makeMarkKey(kind: ItemKey, productCode: string): string {
  return `${kind}:${productCode}`;
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

export default function OperationChecklistPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [expanded, setExpanded] = useState<Set<ItemKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newArrivalMarks, setNewArrivalMarks] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNewArrivalMarks(loadNewArrivalMarks());
  }, []);

  const toggleNewArrival = React.useCallback((kind: ItemKey, productCode: string) => {
    setNewArrivalMarks((prev) => {
      const next = new Set(prev);
      const key = makeMarkKey(kind, productCode);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveNewArrivalMarks(next);
      return next;
    });
  }, []);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAdminToken();
      const res = await fetch("/api/admin/operation-checklist", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string; counts?: Counts; details?: Details };
      if (!res.ok || !payload.ok) {
        setError(payload.message || "데이터를 불러오지 못했습니다.");
        return;
      }
      setCounts(payload.counts ?? null);
      setDetails(payload.details ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 760, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0f172a" }}>통합체크리스트</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            border: "1px solid #cbd5f5",
            background: "#fff",
            color: "#1f2a44",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ border: "1px solid #cbd5e1", background: "#fff", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>No.</th>
              <th style={thStyle}>내용</th>
              <th style={thStyle}>총 건 수</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map((item, idx) => {
              const count = counts?.[item.key];
              const pending = item.key === "shipment_below_standard" ? false : false;
              const itemDetails = details?.[item.key] ?? [];
              const isNewArrivalKind = NEW_ARRIVAL_KINDS.includes(item.key);
              const newArrivalExcluded = isNewArrivalKind
                ? itemDetails.filter((it) => newArrivalMarks.has(makeMarkKey(item.key, it.product_code))).length
                : 0;
              const adjustedCount = count == null ? null : Math.max(0, count - newArrivalExcluded);
              const countDisplay = pending
                ? "준비중"
                : adjustedCount == null
                ? "…"
                : adjustedCount.toLocaleString();
              const isAlert = !pending && (adjustedCount ?? 0) > 0;
              const isOpen = expanded.has(item.key);
              const clickable = (isAlert || itemDetails.length > 0) && !pending;

              return (
                <React.Fragment key={item.key}>
                  <tr
                    onClick={() => {
                      if (!clickable) return;
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.key)) next.delete(item.key);
                        else next.add(item.key);
                        return next;
                      });
                    }}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      cursor: clickable ? "pointer" : "default",
                      background: isOpen ? "#eef2ff" : "transparent",
                    }}
                  >
                    <td style={tdCenter}>{idx + 1}</td>
                    <td style={{ ...tdCell, fontWeight: 600 }}>
                      {clickable && (
                        <span style={{ display: "inline-block", marginRight: 6, color: "#64748b", fontSize: 11 }}>
                          {isOpen ? "▼" : "▶"}
                        </span>
                      )}
                      {item.label}
                    </td>
                    <td
                      style={{
                        ...tdCenter,
                        fontWeight: 700,
                        color: pending ? "#94a3b8" : isAlert ? "#dc2626" : "#0f172a",
                      }}
                    >
                      {countDisplay}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={3} style={{ padding: 0, background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                        <DetailTable
                          kind={item.key}
                          items={itemDetails}
                          newArrivalMarks={newArrivalMarks}
                          onToggleNewArrival={toggleNewArrival}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailTable({
  kind,
  items,
  newArrivalMarks,
  onToggleNewArrival,
}: {
  kind: ItemKey;
  items: DetailItem[];
  newArrivalMarks: Set<string>;
  onToggleNewArrival: (kind: ItemKey, productCode: string) => void;
}) {
  const columns = useMemo(() => detailColumns(kind), [kind]);
  const showNewArrival = NEW_ARRIVAL_KINDS.includes(kind);
  if (items.length === 0) {
    return <div style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>해당 항목 없음</div>;
  }
  return (
    <div style={{ maxHeight: 320, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#e2e8f0", position: "sticky", top: 0 }}>
            {columns.map((col) => (
              <th key={col.key} style={{ ...thStyle, fontSize: 12, padding: "6px 8px", textAlign: col.align ?? "left" }}>
                {col.label}
              </th>
            ))}
            {showNewArrival && (
              <th style={{ ...thStyle, fontSize: 12, padding: "6px 8px", textAlign: "center", width: 90 }}>
                금주신상
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const markKey = makeMarkKey(kind, it.product_code);
            const isMarked = showNewArrival && newArrivalMarks.has(markKey);
            return (
              <tr
                key={`${it.product_code}-${i}`}
                style={{
                  borderTop: "1px solid #e2e8f0",
                  background: isMarked ? "#fef3c7" : "#fff",
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      ...tdCell,
                      fontSize: 12,
                      padding: "5px 8px",
                      textAlign: col.align ?? "left",
                      color: col.muted ? "#475569" : "#0f172a",
                    }}
                  >
                    {col.render(it)}
                  </td>
                ))}
                {showNewArrival && (
                  <td style={{ ...tdCell, fontSize: 12, padding: "5px 8px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={isMarked}
                      onChange={() => onToggleNewArrival(kind, it.product_code)}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type DetailColumn = {
  key: string;
  label: string;
  render: (it: DetailItem) => React.ReactNode;
  align?: "left" | "center" | "right";
  muted?: boolean;
};

function formatPickingCell(cell: string): string {
  if (!cell) return "-";
  const digits = cell.replace(/\D/g, "");
  if (!digits) return cell;
  const padded = digits.padStart(7, "0");
  return `${padded.slice(0, 2)}-${padded.slice(2, 4)}-${padded.slice(4, 7)}`;
}

function detailColumns(kind: ItemKey): DetailColumn[] {
  const codeCol: DetailColumn = { key: "code", label: "상품코드", render: (it) => it.product_code, align: "center" };
  const nameCol: DetailColumn = { key: "name", label: "상품명", render: (it) => it.product_name || "-", align: "center" };
  const cellCol: DetailColumn = { key: "cell", label: "피킹셀", render: (it) => formatPickingCell(it.picking_cell ?? ""), align: "center" };

  switch (kind) {
    case "location_missing":
      return [codeCol, nameCol];
    case "work_type_missing":
      return [codeCol, nameCol, { ...cellCol, muted: true }];
    case "work_type_misconfigured":
      return [
        codeCol,
        nameCol,
        cellCol,
        { key: "wt", label: "현재 작업구분", render: (it) => it.work_type || "-", align: "center" },
        { key: "ewt", label: "기대값", render: (it) => it.expected_work_type || "-", align: "center", muted: true },
      ];
    case "cell_mismatch":
      return [
        cellCol,
        codeCol,
        nameCol,
        { key: "qty", label: "가용수량", render: (it) => (it.qty ?? 0).toLocaleString(), align: "center" },
        { key: "cur", label: "현재고셀", render: (it) => formatPickingCell(it.current_cell ?? ""), align: "center" },
      ];
    case "full_box_missing":
      return [
        cellCol,
        codeCol,
        nameCol,
        { key: "fb", label: "완박스여부", render: (it) => it.full_box_yn || "-", align: "center" },
      ];
    case "shipment_below_standard":
      return [
        cellCol,
        codeCol,
        nameCol,
        { key: "qty", label: "가용수량", render: (it) => (it.qty ?? 0).toLocaleString(), align: "center" },
        { key: "exp", label: "소비기한", render: (it) => it.expiry_date || "-", align: "center" },
        { key: "cut", label: "기준일", render: (it) => it.cutoff_date || "-", align: "center", muted: true },
        {
          key: "ds",
          label: "미달일수",
          render: (it) => (it.days_short != null ? `${it.days_short.toLocaleString()}일` : "-"),
          align: "center",
        },
      ];
    default:
      return [codeCol, nameCol];
  }
}

const thStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  padding: "8px 6px",
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
  textAlign: "center",
  background: "#f1f5f9",
};

const tdCell: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "7px 10px",
  fontSize: 13,
  color: "#0f172a",
};

const tdCenter: React.CSSProperties = {
  ...tdCell,
  textAlign: "center",
};
