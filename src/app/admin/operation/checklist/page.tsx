"use client";

import React, { useEffect, useState } from "react";
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
  const [sources, setSources] = useState<Sources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>통합체크리스트</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            border: "1px solid #cbd5f5",
            background: "#fff",
            color: "#1f2a44",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
          {error}
        </div>
      )}

      {sources && (
        <div style={{ fontSize: 12, color: "#64748b" }}>
          재고 보유 SKU {sources.inventory_stock_count.toLocaleString()}건 / 전략관리 등록 {sources.strategy_count.toLocaleString()}건 기준
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        <ChecklistRow
          title="로케이션 미지정"
          description="재고는 있으나 상품별 전략관리의 피킹셀이 비어있는 SKU"
          count={counts?.location_missing}
          loading={loading}
        />
        <ChecklistRow
          title="작업구분 미지정 / 설정오류"
          description="작업구분이 비어있거나, 피킹셀 앞 2자리와 작업구분이 매핑표와 일치하지 않는 SKU"
          count={
            counts == null
              ? undefined
              : counts.work_type_missing + counts.work_type_misconfigured
          }
          subCounts={
            counts == null
              ? undefined
              : [
                  { label: "미지정", value: counts.work_type_missing },
                  { label: "설정오류", value: counts.work_type_misconfigured },
                ]
          }
          loading={loading}
        />
        <ChecklistRow
          title="완박스작업 미지정"
          description="피킹셀 앞 2자리가 07(이너존A) 또는 21~25(슬라존A) 이지만 완박스작업여부가 '예'가 아닌 SKU"
          count={counts?.full_box_missing}
          loading={loading}
        />
        <ChecklistRow
          title="출고기준미달"
          description="세부 기준 확정 후 구현 예정"
          count={counts?.shipment_below_standard}
          loading={loading}
          pending
        />
      </div>
    </div>
  );
}

function ChecklistRow({
  title,
  description,
  count,
  subCounts,
  loading,
  pending,
}: {
  title: string;
  description: string;
  count: number | undefined;
  subCounts?: { label: string; value: number }[];
  loading: boolean;
  pending?: boolean;
}) {
  const showCount = count != null && !loading;
  const isAlert = showCount && (count ?? 0) > 0 && !pending;

  return (
    <div
      style={{
        border: "1px solid #E8EDF2",
        borderRadius: 10,
        background: "#fff",
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
        boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>{description}</div>
        {subCounts && (
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "#475569" }}>
            {subCounts.map((sc) => (
              <span key={sc.label}>
                {sc.label} <strong style={{ color: "#0f172a", marginLeft: 4 }}>{sc.value.toLocaleString()}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          minWidth: 96,
          textAlign: "right",
          fontSize: 28,
          fontWeight: 900,
          color: pending ? "#94a3b8" : isAlert ? "#dc2626" : "#0f172a",
        }}
      >
        {pending ? "준비중" : loading ? "…" : (count ?? 0).toLocaleString()}
      </div>
    </div>
  );
}
