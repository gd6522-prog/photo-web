"use client";

import React, { useEffect, useMemo, useState } from "react";
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
};

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

  const load = React.useCallback(async (part: WorkPartKey) => {
    try {
      setLoading(true);
      setError("");
      const token = await getAdminToken();
      const res = await fetch(`/api/admin/inventory-check?part=${encodeURIComponent(part)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string; rows?: Row[] };
      if (!res.ok || !payload.ok) {
        setError(payload.message || "데이터를 불러오지 못했습니다.");
        setRows([]);
        return;
      }
      setRows(payload.rows ?? []);
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

  const onPrint = () => window.print();

  return (
    <div className="ic-page" style={{ display: "grid", gap: 12 }}>
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
          <button type="button" onClick={onPrint} style={{ ...btnStyle, background: "#0f766e", color: "#fff", borderColor: "#0f766e" }}>
            인쇄
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
            <col style={{ width: 90 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={`${r.product_code}-${r.expiry_date}-${idx}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={tdC}>{formatPickingCell(r.picking_cell)}</td>
                  <td style={tdC}>{r.product_code}</td>
                  <td style={tdName} title={r.product_name || ""}>{r.product_name || "-"}</td>
                  <td style={tdR}>{r.box_unit ? r.box_unit.toLocaleString() : "-"}</td>
                  <td style={tdR}>{r.picking_unit ? r.picking_unit.toLocaleString() : "-"}</td>
                  <td style={tdC}>{r.expiry_date || "-"}</td>
                  <td style={tdR}>{r.computed_qty.toLocaleString()}</td>
                  <td style={tdR}>{r.box_count.toLocaleString()}</td>
                  <td style={tdR}>{r.unit_count.toLocaleString()}</td>
                  <td style={tdC} />
                  <td style={tdC} />
                  <td style={tdC} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
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
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }
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
