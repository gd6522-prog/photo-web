"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Counts = {
  location_missing: number;
  work_type_missing: number;
  work_type_misconfigured: number;
  full_box_missing: number;
  shipment_below_standard: number;
};

type Sources = {
  inventory_stock_count: number;
  strategy_count: number;
};

type ChecklistItem = {
  label: string;
  count: number | null;
  pending?: boolean;
};

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

function formatDateDot(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return iso.replace(/-/g, ".");
}

function todayKstISO(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function OperationChecklistPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [, setSources] = useState<Sources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 헤더 필터 (표시용 — 실제 카운팅에는 영향 없음, 인쇄/엑셀에 그대로 출력)
  const [warehouseCode, setWarehouseCode] = useState("T01234");
  const [deliveryDate, setDeliveryDate] = useState(todayKstISO());
  const [shipmentRound, setShipmentRound] = useState("");

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAdminToken();
      const res = await fetch("/api/admin/operation-checklist", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string; counts?: Counts; sources?: Sources };
      if (!res.ok || !payload.ok) {
        setError(payload.message || "데이터를 불러오지 못했습니다.");
        return;
      }
      setCounts(payload.counts ?? null);
      setSources(payload.sources ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo<ChecklistItem[]>(() => {
    return [
      { label: "로케이션 미지정", count: counts?.location_missing ?? null },
      { label: "작업구분 미지정", count: counts?.work_type_missing ?? null },
      { label: "작업구분 설정오류", count: counts?.work_type_misconfigured ?? null },
      { label: "완박스작업 미지정", count: counts?.full_box_missing ?? null },
      { label: "출고기준미달", count: counts?.shipment_below_standard ?? null, pending: true },
    ];
  }, [counts]);

  const dateDot = formatDateDot(deliveryDate);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0f172a" }}>
          출고 &gt; 통합체크리스트
        </h1>
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

      {/* 헤더 필터 영역 */}
      <div
        style={{
          border: "1px solid #cbd5e1",
          background: "#f8fafc",
          padding: 10,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <FilterField label="창고코드">
          <select
            value={warehouseCode}
            onChange={(e) => setWarehouseCode(e.target.value)}
            style={selectStyle}
          >
            <option value="T01234">화성(상온)</option>
          </select>
        </FilterField>
        <FilterField label="납품예정일">
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            style={inputStyle}
          />
        </FilterField>
        <FilterField label="배송편수">
          <input
            type="text"
            value={shipmentRound}
            onChange={(e) => setShipmentRound(e.target.value)}
            placeholder="예: 3편"
            style={{ ...inputStyle, width: 120 }}
          />
        </FilterField>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 항목 개수 뱃지 */}
      <div>
        <span
          style={{
            display: "inline-block",
            background: "#e2e8f0",
            border: "1px solid #cbd5e1",
            color: "#0f172a",
            padding: "4px 14px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 2,
          }}
        >
          {items.length}
        </span>
      </div>

      {/* 본 테이블 */}
      <div style={{ border: "1px solid #cbd5e1", background: "#fff", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>No.</th>
              <th style={thStyle}>창고코드</th>
              <th style={thStyle}>납품예정일</th>
              <th style={thStyle}>배송편수</th>
              <th style={thStyle}>내용</th>
              <th style={thStyle}>총 건 수</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const countDisplay = item.pending
                ? "준비중"
                : item.count == null
                ? "…"
                : item.count.toLocaleString();
              const isAlert = !item.pending && (item.count ?? 0) > 0;
              return (
                <tr key={item.label} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={tdCenter}>{idx + 1}</td>
                  <td style={tdCenter}>{warehouseCode}</td>
                  <td style={tdCenter}>{dateDot}</td>
                  <td style={tdCenter}>{shipmentRound || "-"}</td>
                  <td style={{ ...tdCell, color: "#1d4ed8", fontWeight: 600 }}>{item.label}</td>
                  <td
                    style={{
                      ...tdCenter,
                      fontWeight: 700,
                      color: item.pending ? "#94a3b8" : isAlert ? "#dc2626" : "#0f172a",
                    }}
                  >
                    {countDisplay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  padding: "7px 8px",
  fontSize: 13,
  color: "#0f172a",
};

const tdCenter: React.CSSProperties = {
  ...tdCell,
  textAlign: "center",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  padding: "5px 8px",
  fontSize: 13,
  background: "#fff",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 120,
};

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          background: "#e2e8f0",
          color: "#0f172a",
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 2,
          whiteSpace: "nowrap",
        }}
      >
        {label} <span style={{ color: "#dc2626" }}>*</span>
      </span>
      {children}
    </div>
  );
}
