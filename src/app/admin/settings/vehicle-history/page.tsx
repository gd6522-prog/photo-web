"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type FileResult = {
  fileName: string;
  status: "pending" | "uploading" | "done" | "error";
  deliveryDates?: string[];
  error?: string;
};

// ── 달력 ──────────────────────────────────────────────────────────────────

const MONTH_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const DAY_KO   = ["일","월","화","수","목","금","토"];

function Calendar({
  fileDates,
  onDateClick,
}: {
  fileDates: Set<string>;
  onDateClick: (date: string) => void;
}) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selected, setSelected] = useState<string | null>(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelected(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelected(null);
  };

  const firstDow  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMon }, (_, i) => i + 1),
  ];
  // 6행 맞추기
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const handleClick = (d: number) => {
    const ds = fmt(d);
    if (!fileDates.has(ds)) return;
    setSelected(ds);
    onDateClick(ds);
  };

  return (
    <div>
      {/* 월 네비게이션 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button
          onClick={prevMonth}
          style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontWeight: 800, color: "#475569", fontSize: 15 }}
        >
          ‹
        </button>
        <span style={{ fontWeight: 900, fontSize: 15, color: "#103b53" }}>{year}년 {MONTH_KO[month]}</span>
        <button
          onClick={nextMonth}
          style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontWeight: 800, color: "#475569", fontSize: 15 }}
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
        {DAY_KO.map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : "#64748b", padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const ds = fmt(day);
          const hasFile  = fileDates.has(ds);
          const isSel    = selected === ds;
          const dow      = (firstDow + day - 1) % 7;
          const isSun    = dow === 0;
          const isSat    = dow === 6;

          return (
            <div
              key={ds}
              onClick={() => handleClick(day)}
              title={hasFile ? "클릭해서 파일 확인" : undefined}
              style={{
                textAlign: "center",
                padding: "7px 2px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: hasFile ? 900 : 500,
                background: isSel
                  ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)"
                  : hasFile
                  ? "#ccfbf1"
                  : "transparent",
                color: isSel
                  ? "#fff"
                  : hasFile
                  ? "#0f766e"
                  : isSun
                  ? "#fca5a5"
                  : isSat
                  ? "#93c5fd"
                  : "#94a3b8",
                cursor: hasFile ? "pointer" : "default",
                border: isSel
                  ? "none"
                  : hasFile
                  ? "1px solid #5eead4"
                  : "1px solid transparent",
                boxShadow: isSel ? "0 2px 8px rgba(15,118,110,0.35)" : "none",
                transition: "all 0.12s",
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────

export default function VehicleHistoryUploadPage() {
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef(false);
  const [files,   setFiles]   = useState<FileResult[]>([]);
  const [running, setRunning] = useState(false);

  // 달력 관련 상태
  const [fileDates,    setFileDates]    = useState<Set<string>>(new Set());
  const [calLoading,   setCalLoading]   = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateInfo,     setDateInfo]     = useState<{ fileName: string; uploadedAt: string } | null>(null);
  const [dateInfoLoading, setDateInfoLoading] = useState(false);

  // R2 daily 날짜 목록 로드
  const loadDates = useCallback(async () => {
    setCalLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      const res  = await fetch("/api/admin/vehicles/daily-list", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setFileDates(new Set<string>(data.dates ?? []));
    } catch {
      // 무시
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => { void loadDates(); }, [loadDates]);

  // 날짜 클릭 → 파일명 조회
  const handleDateClick = async (date: string) => {
    setSelectedDate(date);
    setDateInfo(null);
    setDateInfoLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      const res  = await fetch(`/api/admin/vehicles/daily-list?date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setDateInfo({ fileName: data.fileName ?? "", uploadedAt: data.uploadedAt ?? "" });
    } catch {
      setDateInfo(null);
    } finally {
      setDateInfoLoading(false);
    }
  };

  // ── 업로드 로직 ────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
      .filter((f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))
      .sort((a, b) => a.name.localeCompare(b.name));
    setFiles(selected.map((f) => ({ fileName: f.name, status: "pending" })));
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
      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));

      try {
        const form = new FormData();
        form.append("file", file);

        const res  = await fetch("/api/admin/vehicles/current", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          setFiles((prev) => prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: data.message ?? `HTTP ${res.status}` } : f
          ));
          continue;
        }

        const rows: { delivery_date?: string }[] = data.data?.snapshot?.productRows ?? [];
        const dates = [...new Set(rows.map((r) => r.delivery_date).filter(Boolean))].sort() as string[];

        setFiles((prev) => prev.map((f, idx) =>
          idx === i ? { ...f, status: "done", deliveryDates: dates } : f
        ));
      } catch (e: any) {
        setFiles((prev) => prev.map((f, idx) =>
          idx === i ? { ...f, status: "error", error: e?.message ?? String(e) } : f
        ));
      }
    }

    setRunning(false);
    // 업로드 완료 후 달력 갱신
    void loadDates();
  };

  const handleStop  = () => { abortRef.current = true; };

  const handleReset = () => {
    setFiles([]);
    if (inputRef.current) {
      inputRef.current.value = "";
      (inputRef.current as any).__files = [];
    }
  };

  const doneCount    = files.filter((f) => f.status === "done").length;
  const errorCount   = files.filter((f) => f.status === "error").length;
  const pendingCount = files.filter((f) => f.status === "pending").length;

  // ── 현재 latest.json → daily 재생성 ──────────────────────────────────
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState("");

  const handleRebuildDaily = async () => {
    setRebuilding(true);
    setRebuildMsg("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) { setRebuildMsg("로그인이 필요합니다."); return; }

      const res  = await fetch("/api/admin/vehicles/current", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild-daily" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRebuildMsg(data.message ?? "재생성 실패");
      } else {
        const dates: string[] = data.data?.dates ?? [];
        setRebuildMsg(dates.length > 0 ? `재생성 완료: ${dates.sort().join(", ")}` : "납품예정일 데이터가 없습니다.");
        void loadDates();
      }
    } catch (e: any) {
      setRebuildMsg(e?.message ?? "오류 발생");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── 업로드 카드 ─────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #c9d9e4", borderRadius: 18, padding: 28, boxShadow: "0 8px 24px rgba(2,32,46,0.07)" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#103b53", marginBottom: 6 }}>과거 차량데이터 업로드</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          .xlsx 파일을 여러 개 선택하면 순서대로 처리합니다. 납품예정일(delivery_date) 기준으로 daily 데이터가 저장됩니다.
        </div>

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

        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button
            onClick={handleStart}
            disabled={running || files.length === 0}
            style={{
              padding: "10px 28px", borderRadius: 9, border: "none",
              background: running || files.length === 0 ? "#94a3b8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
              color: "#fff", fontWeight: 900, fontSize: 14,
              cursor: running || files.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {running ? "업로드 중..." : "업로드 시작"}
          </button>

          {running && (
            <button
              onClick={handleStop}
              style={{ padding: "10px 22px", borderRadius: 9, border: "1.5px solid #ef4444", background: "#fff", color: "#ef4444", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
            >
              중단
            </button>
          )}

          {!running && files.length > 0 && (
            <button
              onClick={handleReset}
              style={{ padding: "10px 22px", borderRadius: 9, border: "1.5px solid #cbd5e1", background: "#fff", color: "#64748b", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
            >
              초기화
            </button>
          )}
        </div>

        {files.length > 0 && (
          <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 13, fontWeight: 800 }}>
            <span style={{ color: "#0f766e" }}>완료 {doneCount}</span>
            <span style={{ color: "#ef4444" }}>오류 {errorCount}</span>
            <span style={{ color: "#94a3b8" }}>대기 {pendingCount}</span>
            <span style={{ color: "#475569" }}>전체 {files.length}</span>
          </div>
        )}

        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflowY: "auto" }}>
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 14px", borderRadius: 9,
                  border: `1.5px solid ${f.status === "done" ? "#bbf7d0" : f.status === "error" ? "#fecaca" : f.status === "uploading" ? "#bae6fd" : "#e2e8f0"}`,
                  background: f.status === "done" ? "#f0fdf4" : f.status === "error" ? "#fef2f2" : f.status === "uploading" ? "#f0f9ff" : "#f8fafc",
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}
              >
                <span style={{ fontSize: 16, marginTop: 1 }}>
                  {f.status === "done" ? "✅" : f.status === "error" ? "❌" : f.status === "uploading" ? "⏳" : "⬜"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", wordBreak: "break-all" }}>{f.fileName}</div>
                  {f.status === "done" && f.deliveryDates && f.deliveryDates.length > 0 && (
                    <div style={{ fontSize: 12, color: "#0f766e", marginTop: 3 }}>납품예정일: {f.deliveryDates.join(", ")}</div>
                  )}
                  {f.status === "error" && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 3 }}>{f.error}</div>}
                  {f.status === "uploading" && <div style={{ fontSize: 12, color: "#0284c7", marginTop: 3 }}>처리 중...</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 달력 카드 ───────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #c9d9e4", borderRadius: 18, padding: 28, boxShadow: "0 8px 24px rgba(2,32,46,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#103b53" }}>저장된 데이터 달력</div>
          <button
            onClick={handleRebuildDaily}
            disabled={rebuilding}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "1.5px solid #0f766e",
              background: rebuilding ? "#f0fdf4" : "#fff", color: rebuilding ? "#94a3b8" : "#0f766e",
              fontWeight: 800, fontSize: 13, cursor: rebuilding ? "not-allowed" : "pointer",
            }}
          >
            {rebuilding ? "재생성 중..." : "현재 단품별 → daily 재생성"}
          </button>
        </div>
        {rebuildMsg && (
          <div style={{ fontSize: 12, color: rebuildMsg.includes("완료") ? "#0f766e" : "#ef4444", marginBottom: 8, fontWeight: 700 }}>
            {rebuildMsg}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
          음영 표시된 날짜는 R2에 daily 파일이 존재합니다. 클릭하면 파일명을 확인할 수 있습니다.
        </div>

        {calLoading ? (
          <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>달력 로딩 중...</div>
        ) : (
          <>
            <Calendar fileDates={fileDates} onDateClick={handleDateClick} />

            {/* 범례 */}
            <div style={{ display: "flex", gap: 14, marginTop: 16, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 14, background: "#ccfbf1", border: "1px solid #5eead4", borderRadius: 3, display: "inline-block" }} />
                파일 있음
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 14, background: "linear-gradient(135deg,#103b53,#0f766e)", borderRadius: 3, display: "inline-block" }} />
                선택됨
              </span>
              <span style={{ color: "#475569", fontWeight: 700 }}>총 {fileDates.size}일 저장됨</span>
            </div>

            {/* 선택 날짜 정보 */}
            {selectedDate && (
              <div style={{
                marginTop: 16, padding: "14px 16px", borderRadius: 10,
                background: "#f0fdf4", border: "1.5px solid #bbf7d0",
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0f766e", marginBottom: 4 }}>{selectedDate}</div>
                {dateInfoLoading ? (
                  <div style={{ fontSize: 12, color: "#64748b" }}>파일명 조회 중...</div>
                ) : dateInfo ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", wordBreak: "break-all" }}>{dateInfo.fileName || "파일명 없음"}</div>
                    {dateInfo.uploadedAt && (
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                        업로드: {new Date(dateInfo.uploadedAt).toLocaleString("ko-KR")}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "#ef4444" }}>정보를 불러올 수 없습니다.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
