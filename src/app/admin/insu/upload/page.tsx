"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #c7d6e3",
  borderRadius: 8,
  padding: "28px 32px",
  boxShadow: "0 2px 8px rgba(2,32,46,0.06)",
  maxWidth: 600,
  margin: "0 auto",
};

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export default function InsuUploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(() => `${new Date().getMonth() + 1}월`);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ receiptCount: number; rowCount: number } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xlsm|xls)$/i)) {
      setError("xlsx, xlsm, xls 파일만 가능합니다");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const fd = new FormData();
      fd.append("file", file);
      fd.append("monthLabel", month);

      const res = await fetch("/api/insu/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");

      setResult({ receiptCount: json.receiptCount, rowCount: json.rowCount });
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 950, color: "#103b53", margin: 0 }}>미오출 파일 업로드</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          단품별검수조회에서 내려받은 미오출 엑셀 파일을 업로드하면 인수증을 자동 생성합니다
        </p>
      </div>

      <div style={cardStyle}>
        {/* 월 선택 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontWeight: 900, fontSize: 13, color: "#374151", marginBottom: 6 }}>
            대상 월
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c7d6e3", fontSize: 13, fontWeight: 800, color: "#103b53", width: 120 }}
          >
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* 파일 드롭존 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#0f766e" : "#c7d6e3"}`,
            borderRadius: 8,
            padding: "40px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "#f0fdf4" : "#fafcff",
            transition: "all 0.15s",
            marginBottom: 20,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 900, color: "#103b53", fontSize: 14 }}>{file.name}</div>
              <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                {(file.size / 1024).toFixed(1)} KB
              </div>
              <div style={{ color: "#0f766e", fontSize: 12, marginTop: 8, fontWeight: 700 }}>클릭하여 다른 파일 선택</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <div style={{ fontWeight: 900, color: "#374151", fontSize: 14 }}>파일을 드래그하거나 클릭하여 선택</div>
              <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 6 }}>xlsx, xlsm, xls 지원</div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", color: "#dc2626", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ background: "#f0fdf4", border: "1px solid #6ee7b7", borderRadius: 6, padding: "16px 14px", marginBottom: 16 }}>
            <div style={{ fontWeight: 900, color: "#059669", fontSize: 14, marginBottom: 6 }}>업로드 완료!</div>
            <div style={{ fontSize: 13, color: "#374151" }}>
              미오출 {result.rowCount.toLocaleString()}행 → 인수증 <strong>{result.receiptCount.toLocaleString()}건</strong> 생성
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => router.push("/admin/insu/print")}
                style={{ padding: "8px 16px", borderRadius: 6, background: "linear-gradient(135deg,#103b53,#0f766e)", color: "#fff", border: "none", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
              >
                인수증 출력하기
              </button>
              <button
                onClick={() => router.push("/admin/insu")}
                style={{ padding: "8px 16px", borderRadius: 6, background: "#fff", color: "#103b53", border: "1px solid #c7d6e3", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
              >
                관리대장으로
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            background: !file || uploading ? "#e5e7eb" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
            color: !file || uploading ? "#9ca3af" : "#fff",
            border: "none",
            fontWeight: 950,
            fontSize: 15,
            cursor: !file || uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "처리 중..." : "업로드 및 인수증 생성"}
        </button>

        <div style={{ marginTop: 20, padding: "14px", background: "#f8fbff", borderRadius: 6, border: "1px solid #e5edf3" }}>
          <div style={{ fontWeight: 900, fontSize: 12, color: "#374151", marginBottom: 6 }}>업로드 기준</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#6b7280", lineHeight: 1.8 }}>
            <li>RAW 시트의 미오출수량 ≠ 0인 행만 처리</li>
            <li>점포등록사유 기준으로 인수증 구분 (파손/오발주/재배송/맞교환)</li>
            <li>호차+순번+점포코드+사유 단위로 인수증 1건 생성</li>
            <li>바코드: 사유코드(2)+년도(4)+월(2)+일(2)+점포코드(5)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
