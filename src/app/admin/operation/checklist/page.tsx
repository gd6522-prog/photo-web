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

type Diagnostic = {
  stock_no_strategy: number;
  prefix_distribution: Record<string, number>;
  full_box_value_distribution: Record<string, number>;
  inventory_headers?: string[];
  strategy_headers?: string[];
  inventory_matched?: { code: number; qty: number };
  strategy_matched?: { code: number; cell: number; workType: number; fullBox: number };
  inventory_key_tail?: string;
  strategy_key_tail?: string;
  inventory_total_rows?: number;
  inventory_with_code_rows?: number;
  inventory_with_qty_rows?: number;
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

export default function OperationChecklistPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [, setSources] = useState<Sources | null>(null);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
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
      const payload = (await res.json()) as { ok?: boolean; message?: string; counts?: Counts; sources?: Sources; diagnostic?: Diagnostic };
      if (!res.ok || !payload.ok) {
        setError(payload.message || "데이터를 불러오지 못했습니다.");
        return;
      }
      setCounts(payload.counts ?? null);
      setSources(payload.sources ?? null);
      setDiagnostic(payload.diagnostic ?? null);
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

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0f172a" }}>통합체크리스트</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setShowDiagnostic((v) => !v)}
            style={{
              border: "1px solid #cbd5f5",
              background: showDiagnostic ? "#eef2ff" : "#fff",
              color: "#1f2a44",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            진단
          </button>
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
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {error}
        </div>
      )}

      {showDiagnostic && diagnostic && (
        <div style={{ border: "1px dashed #94a3b8", background: "#f8fafc", padding: 12, fontSize: 12, color: "#334155", display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>진단 정보</div>
          <div>전략관리 미등록 재고 SKU: <strong>{diagnostic.stock_no_strategy.toLocaleString()}</strong>건</div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>사용 파일</div>
            <div style={{ paddingLeft: 8, fontSize: 11, color: "#475569", wordBreak: "break-all" }}>
              <div>재고: …{diagnostic.inventory_key_tail ?? "(없음)"}</div>
              <div>전략: …{diagnostic.strategy_key_tail ?? "(없음)"}</div>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>재고 파일 컬럼 매칭 (-1 이면 못찾음)</div>
            <div style={{ paddingLeft: 8 }}>
              상품코드: <strong style={{ color: (diagnostic.inventory_matched?.code ?? -1) < 0 ? "#dc2626" : "#0f172a" }}>{diagnostic.inventory_matched?.code ?? "-"}</strong>{" / "}
              가용재고: <strong style={{ color: (diagnostic.inventory_matched?.qty ?? -1) < 0 ? "#dc2626" : "#0f172a" }}>{diagnostic.inventory_matched?.qty ?? "-"}</strong>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>재고 파일 행수</div>
            <div style={{ paddingLeft: 8 }}>
              전체: <strong>{(diagnostic.inventory_total_rows ?? 0).toLocaleString()}</strong>{" / "}
              상품코드有: <strong>{(diagnostic.inventory_with_code_rows ?? 0).toLocaleString()}</strong>{" / "}
              가용재고&gt;0: <strong>{(diagnostic.inventory_with_qty_rows ?? 0).toLocaleString()}</strong>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>재고 파일 헤더 (원문)</div>
            <div style={{ paddingLeft: 8, fontSize: 11, color: "#475569", wordBreak: "break-all" }}>
              {(diagnostic.inventory_headers ?? []).map((h, i) => (
                <span key={i} style={{ display: "inline-block", marginRight: 8 }}>[{i}] {h || "(빈칸)"}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>전략관리 컬럼 매칭 (-1 이면 못찾음)</div>
            <div style={{ paddingLeft: 8 }}>
              상품코드: <strong>{diagnostic.strategy_matched?.code ?? "-"}</strong>{" / "}
              피킹셀: <strong style={{ color: (diagnostic.strategy_matched?.cell ?? -1) < 0 ? "#dc2626" : "#0f172a" }}>{diagnostic.strategy_matched?.cell ?? "-"}</strong>{" / "}
              작업구분: <strong style={{ color: (diagnostic.strategy_matched?.workType ?? -1) < 0 ? "#dc2626" : "#0f172a" }}>{diagnostic.strategy_matched?.workType ?? "-"}</strong>{" / "}
              완박스: <strong style={{ color: (diagnostic.strategy_matched?.fullBox ?? -1) < 0 ? "#dc2626" : "#0f172a" }}>{diagnostic.strategy_matched?.fullBox ?? "-"}</strong>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>전략관리 파일 헤더 (원문)</div>
            <div style={{ paddingLeft: 8, fontSize: 11, color: "#475569", wordBreak: "break-all" }}>
              {(diagnostic.strategy_headers ?? []).map((h, i) => (
                <span key={i} style={{ display: "inline-block", marginRight: 8 }}>[{i}] {h || "(빈칸)"}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>피킹셀 prefix(앞 2자리) 분포</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", paddingLeft: 8 }}>
              {Object.entries(diagnostic.prefix_distribution).length === 0 && <span style={{ color: "#94a3b8" }}>없음</span>}
              {Object.entries(diagnostic.prefix_distribution)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([prefix, n]) => (
                  <span key={prefix}>{prefix}: <strong>{n.toLocaleString()}</strong></span>
                ))}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>07 / 21~25 셀의 완박스작업여부 값 분포</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", paddingLeft: 8 }}>
              {Object.entries(diagnostic.full_box_value_distribution).length === 0 && <span style={{ color: "#94a3b8" }}>해당 SKU 없음</span>}
              {Object.entries(diagnostic.full_box_value_distribution)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([val, n]) => (
                  <span key={val}>{val}: <strong>{n.toLocaleString()}</strong></span>
                ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid #cbd5e1", background: "#fff", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>No.</th>
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
                  <td style={{ ...tdCell, fontWeight: 600 }}>{item.label}</td>
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
  padding: "7px 10px",
  fontSize: 13,
  color: "#0f172a",
};

const tdCenter: React.CSSProperties = {
  ...tdCell,
  textAlign: "center",
};
