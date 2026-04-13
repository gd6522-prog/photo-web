"use client";

import React, { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type FileResult = {
  fileName: string;
  status: "pending" | "uploading" | "done" | "error";
  deliveryDates?: string[];
  error?: string;
};

export default function VehicleHistoryUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
      .filter((f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))
      .sort((a, b) => a.name.localeCompare(b.name));

    setFiles(selected.map((f) => ({ fileName: f.name, status: "pending" })));
    // file 객체는 따로 보관
    (inputRef.current as any).__files = selected;
  };

  const handleStart = async () => {
    const selectedFiles: File[] = (inputRef.current as any).__files ?? [];
    if (!selectedFiles.length) return;

    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return alert("로그인이 필요합니다.");

    setRunning(true);
    abortRef.current = false;

    for (let i = 0; i < selectedFiles.length; i++) {
      if (abortRef.current) break;

      const file = selectedFiles[i];

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      );

      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/admin/vehicles/current", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "error", error: data.message ?? `HTTP ${res.status}` } : f
            )
          );
          continue;
        }

        // 생성된 납품예정일 목록 추출
        const snapshot = data.data?.snapshot;
        const rows: { delivery_date?: string }[] = snapshot?.productRows ?? [];
        const dates = [...new Set(rows.map((r) => r.delivery_date).filter(Boolean))].sort() as string[];

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "done", deliveryDates: dates } : f
          )
        );
      } catch (e: any) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: e?.message ?? String(e) } : f
          )
        );
      }
    }

    setRunning(false);
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  const handleReset = () => {
    setFiles([]);
    if (inputRef.current) {
      inputRef.current.value = "";
      (inputRef.current as any).__files = [];
    }
  };

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ background: "#fff", border: "1px solid #c9d9e4", borderRadius: 18, padding: 28, boxShadow: "0 8px 24px rgba(2,32,46,0.07)" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#103b53", marginBottom: 6 }}>과거 차량데이터 업로드</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          .xlsx 파일을 여러 개 선택하면 순서대로 처리합니다. 각 파일의 납품예정일(delivery_date)을 기준으로 daily 데이터가 저장됩니다.
        </div>

        {/* 파일 선택 */}
        <div style={{ marginBottom: 16 }}>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleFileChange}
            disabled={running}
            style={{ display: "none" }}
            id="hist-file-input"
          />
          <label
            htmlFor="hist-file-input"
            style={{
              display: "inline-block",
              padding: "10px 22px",
              borderRadius: 9,
              border: "1.5px solid #94a3b8",
              background: running ? "#f1f5f9" : "#f8fafc",
              color: running ? "#94a3b8" : "#103b53",
              fontWeight: 800,
              fontSize: 14,
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            파일 선택 ({files.length > 0 ? `${files.length}개 선택됨` : "미선택"})
          </label>
        </div>

        {/* 시작/중단/초기화 버튼 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button
            onClick={handleStart}
            disabled={running || files.length === 0}
            style={{
              padding: "10px 28px",
              borderRadius: 9,
              border: "none",
              background: running || files.length === 0 ? "#94a3b8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 14,
              cursor: running || files.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {running ? "업로드 중..." : "업로드 시작"}
          </button>
          {running && (
            <button
              onClick={handleStop}
              style={{
                padding: "10px 22px",
                borderRadius: 9,
                border: "1.5px solid #ef4444",
                background: "#fff",
                color: "#ef4444",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              중단
            </button>
          )}
          {!running && files.length > 0 && (
            <button
              onClick={handleReset}
              style={{
                padding: "10px 22px",
                borderRadius: 9,
                border: "1.5px solid #cbd5e1",
                background: "#fff",
                color: "#64748b",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              초기화
            </button>
          )}
        </div>

        {/* 진행 요약 */}
        {files.length > 0 && (
          <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 13, fontWeight: 800 }}>
            <span style={{ color: "#0f766e" }}>완료 {doneCount}</span>
            <span style={{ color: "#ef4444" }}>오류 {errorCount}</span>
            <span style={{ color: "#94a3b8" }}>대기 {pendingCount}</span>
            <span style={{ color: "#475569" }}>전체 {files.length}</span>
          </div>
        )}

        {/* 파일 목록 */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 480, overflowY: "auto" }}>
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 14px",
                  borderRadius: 9,
                  border: `1.5px solid ${
                    f.status === "done" ? "#bbf7d0" :
                    f.status === "error" ? "#fecaca" :
                    f.status === "uploading" ? "#bae6fd" : "#e2e8f0"
                  }`,
                  background:
                    f.status === "done" ? "#f0fdf4" :
                    f.status === "error" ? "#fef2f2" :
                    f.status === "uploading" ? "#f0f9ff" : "#f8fafc",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 16, marginTop: 1 }}>
                  {f.status === "done" ? "✅" :
                   f.status === "error" ? "❌" :
                   f.status === "uploading" ? "⏳" : "⬜"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", wordBreak: "break-all" }}>{f.fileName}</div>
                  {f.status === "done" && f.deliveryDates && f.deliveryDates.length > 0 && (
                    <div style={{ fontSize: 12, color: "#0f766e", marginTop: 3 }}>
                      납품예정일: {f.deliveryDates.join(", ")}
                    </div>
                  )}
                  {f.status === "error" && (
                    <div style={{ fontSize: 12, color: "#ef4444", marginTop: 3 }}>{f.error}</div>
                  )}
                  {f.status === "uploading" && (
                    <div style={{ fontSize: 12, color: "#0284c7", marginTop: 3 }}>처리 중...</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
