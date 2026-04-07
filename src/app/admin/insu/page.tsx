"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Batch = {
  id: string;
  upload_date: string;
  month_label: string;
  file_name: string;
  row_count: number;
  receipt_count: number;
  created_at: string;
};

type Stats = {
  total: number;
  returned: number;
  pending: number;
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #c7d6e3",
  borderRadius: 8,
  padding: "20px 24px",
  boxShadow: "0 2px 8px rgba(2,32,46,0.06)",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "9px 18px",
  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
  color: "#fff",
  border: "1px solid #0e7490",
  borderRadius: 6,
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
  gap: 6,
};

export default function InsuDashboard() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, returned: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [batchRes, statRes] = await Promise.all([
      supabase
        .from("insu_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("insu_receipts")
        .select("is_returned", { count: "exact" }),
    ]);
    setBatches((batchRes.data ?? []) as Batch[]);

    const rows = statRes.data ?? [];
    const total = rows.length;
    const returned = rows.filter((r: { is_returned: boolean }) => r.is_returned).length;
    setStats({ total, returned, pending: total - returned });
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleDelete = async (batchId: string) => {
    if (!confirm("이 배치와 관련 인수증을 모두 삭제하시겠습니까?")) return;
    setDeleting(batchId);
    await supabase.from("insu_batches").delete().eq("id", batchId);
    await load();
    setDeleting(null);
  };

  const statBoxStyle = (color: string): React.CSSProperties => ({
    ...cardStyle,
    borderLeft: `4px solid ${color}`,
    flex: 1,
    minWidth: 140,
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 950, color: "#103b53", margin: 0 }}>인수증 관리대장</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>재출고/회수 인수증 업로드 및 현황 관리</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/insu/upload" style={btnPrimary}>+ 파일 업로드</Link>
          <Link href="/admin/insu/scan" style={{ ...btnPrimary, background: "linear-gradient(135deg,#1d4ed8 0%,#0f766e 100%)", borderColor: "#1d4ed8" }}>
            바코드 스캔
          </Link>
        </div>
      </div>

      {/* 통계 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={statBoxStyle("#0f766e")}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>전체 인수증</div>
          <div style={{ fontSize: 28, fontWeight: 950, color: "#103b53", marginTop: 4 }}>{stats.total.toLocaleString()}</div>
        </div>
        <div style={statBoxStyle("#10b981")}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>회수 완료</div>
          <div style={{ fontSize: 28, fontWeight: 950, color: "#059669", marginTop: 4 }}>{stats.returned.toLocaleString()}</div>
        </div>
        <div style={statBoxStyle("#f59e0b")}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>미회수</div>
          <div style={{ fontSize: 28, fontWeight: 950, color: "#d97706", marginTop: 4 }}>{stats.pending.toLocaleString()}</div>
        </div>
        {stats.total > 0 && (
          <div style={statBoxStyle("#6366f1")}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>회수율</div>
            <div style={{ fontSize: 28, fontWeight: 950, color: "#4f46e5", marginTop: 4 }}>
              {Math.round((stats.returned / stats.total) * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* 배치 목록 */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 950, color: "#103b53", margin: "0 0 16px" }}>업로드 이력</h2>
        {loading ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>불러오는 중...</div>
        ) : batches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
            업로드된 파일이 없습니다.<br />
            <Link href="/admin/insu/upload" style={{ color: "#0f766e", fontWeight: 700 }}>미오출 파일을 업로드</Link>해주세요.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5edf3" }}>
                {["월", "파일명", "데이터 행수", "인수증 수", "업로드일", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontWeight: 900, color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid #f0f4f8" }}>
                  <td style={{ padding: "10px", fontWeight: 800, color: "#103b53" }}>{b.month_label}</td>
                  <td style={{ padding: "10px", color: "#374151", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.file_name ?? "-"}
                  </td>
                  <td style={{ padding: "10px", color: "#374151" }}>{(b.row_count ?? 0).toLocaleString()}행</td>
                  <td style={{ padding: "10px", color: "#374151" }}>{(b.receipt_count ?? 0).toLocaleString()}건</td>
                  <td style={{ padding: "10px", color: "#6b7280" }}>{b.upload_date}</td>
                  <td style={{ padding: "10px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Link
                        href={`/admin/insu/print?batchId=${b.id}`}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid #0e7490", color: "#0e7490", fontWeight: 800, textDecoration: "none" }}
                      >
                        출력
                      </Link>
                      <button
                        onClick={() => handleDelete(b.id)}
                        disabled={deleting === b.id}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid #ef4444", color: "#ef4444", fontWeight: 800, background: "none", cursor: "pointer" }}
                      >
                        {deleting === b.id ? "삭제중..." : "삭제"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
