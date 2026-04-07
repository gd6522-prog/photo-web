"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Receipt = {
  id: string;
  barcode: string;
  store_name: string;
  store_code: string;
  reason_name: string;
  truck_no: number;
  seq_no: number;
  is_returned: boolean;
  delivery_date: string;
  returned_at?: string;
};

type ScanResult = {
  barcode: string;
  status: "success" | "already" | "error";
  message: string;
  receipt?: Receipt;
  time: Date;
};

const REASON_COLORS: Record<string, string> = {
  파손: "#fee2e2", 오발주: "#fef3c7", 재배송: "#dbeafe", 맞교환: "#d1fae5", 긴급출고: "#ede9fe",
};

export default function InsuScanPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState({ total: 0, returned: 0 });

  useEffect(() => {
    inputRef.current?.focus();
    loadStats();
  }, []);

  const loadStats = async () => {
    const { data } = await supabase.from("insu_receipts").select("is_returned");
    const rows = data ?? [];
    setStats({ total: rows.length, returned: rows.filter((r: { is_returned: boolean }) => r.is_returned).length });
  };

  const handleScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/insu/return", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ barcode: trimmed }),
      });

      const json = await res.json();

      let result: ScanResult;

      if (!res.ok) {
        result = {
          barcode: trimmed,
          status: "error",
          message: json.error ?? "처리 실패",
          time: new Date(),
        };
      } else if (json.alreadyReturned) {
        result = {
          barcode: trimmed,
          status: "already",
          message: `이미 회수처리된 인수증입니다 (${json.receipt.store_name})`,
          receipt: json.receipt,
          time: new Date(),
        };
      } else {
        result = {
          barcode: trimmed,
          status: "success",
          message: `회수 완료: ${json.receipt.store_name} [${json.receipt.reason_name}]`,
          receipt: json.receipt,
          time: new Date(),
        };
        await loadStats();
      }

      setHistory((prev) => [result, ...prev.slice(0, 49)]);
    } finally {
      setScanning(false);
      setBarcode("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      void handleScan(barcode);
    }
  };

  const statusColor = (status: ScanResult["status"]) => {
    if (status === "success") return "#dcfce7";
    if (status === "already") return "#fef9c3";
    return "#fee2e2";
  };

  const statusBorder = (status: ScanResult["status"]) => {
    if (status === "success") return "#86efac";
    if (status === "already") return "#fde047";
    return "#fca5a5";
  };

  const statusText = (status: ScanResult["status"]) => {
    if (status === "success") return "#166534";
    if (status === "already") return "#854d0e";
    return "#991b1b";
  };

  const returnRate = stats.total > 0 ? Math.round((stats.returned / stats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 950, color: "#103b53", margin: 0 }}>바코드 스캔 회수 관리</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>바코드 스캐너 또는 직접 입력 후 Enter</p>
      </div>

      {/* 통계 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "전체", value: stats.total, color: "#0f766e" },
          { label: "회수완료", value: stats.returned, color: "#10b981" },
          { label: "미회수", value: stats.total - stats.returned, color: "#f59e0b" },
          { label: "회수율", value: `${returnRate}%`, color: "#6366f1" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", border: `1px solid #c7d6e3`, borderLeft: `4px solid ${s.color}`, borderRadius: 8, padding: "12px 20px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 950, color: s.color, marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 입력창 */}
      <div style={{ background: "#fff", border: "2px solid #0f766e", borderRadius: 12, padding: "24px", marginBottom: 20, boxShadow: "0 4px 16px rgba(15,118,110,0.15)" }}>
        <div style={{ fontWeight: 900, color: "#103b53", fontSize: 15, marginBottom: 12 }}>
          바코드 입력
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="바코드를 스캔하거나 입력하세요..."
            disabled={scanning}
            autoComplete="off"
            style={{
              flex: 1,
              padding: "14px 16px",
              borderRadius: 8,
              border: "2px solid #c7d6e3",
              fontSize: 16,
              fontFamily: "monospace",
              fontWeight: 700,
              outline: "none",
              color: "#103b53",
            }}
          />
          <button
            onClick={() => void handleScan(barcode)}
            disabled={!barcode.trim() || scanning}
            style={{
              padding: "0 24px",
              borderRadius: 8,
              background: !barcode.trim() || scanning ? "#e5e7eb" : "linear-gradient(135deg,#103b53,#0f766e)",
              color: !barcode.trim() || scanning ? "#9ca3af" : "#fff",
              border: "none",
              fontWeight: 950,
              fontSize: 14,
              cursor: !barcode.trim() || scanning ? "not-allowed" : "pointer",
              minWidth: 100,
            }}
          >
            {scanning ? "처리중..." : "확인 (Enter)"}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          바코드 형식: 사유코드(2) + 년도(4) + 월(2) + 일(2) + 점포코드(5) = 15자리
        </div>
      </div>

      {/* 스캔 이력 */}
      <div style={{ background: "#fff", border: "1px solid #c7d6e3", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5edf3", fontWeight: 900, fontSize: 14, color: "#103b53", display: "flex", justifyContent: "space-between" }}>
          <span>스캔 이력 ({history.length}건)</span>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              style={{ fontSize: 12, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
            >
              초기화
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af", fontSize: 14 }}>
            스캔된 바코드가 없습니다
          </div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {history.map((h, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #f0f4f8",
                  background: statusColor(h.status),
                  borderLeft: `4px solid ${statusBorder(h.status)}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 18 }}>
                  {h.status === "success" ? "✓" : h.status === "already" ? "⚠" : "✗"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, color: statusText(h.status), fontSize: 13 }}>{h.message}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    {h.barcode}
                    {h.receipt && (
                      <span style={{
                        marginLeft: 8,
                        background: REASON_COLORS[h.receipt.reason_name] ?? "#f0f4f8",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontFamily: "sans-serif",
                        fontWeight: 700,
                      }}>
                        {h.receipt.reason_name}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                  {h.time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
