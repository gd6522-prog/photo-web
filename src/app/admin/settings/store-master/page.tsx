"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time?: string;
  address?: string;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function normalizeStoreCode(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function findDuplicates(rows: Row[]) {
  const map = new Map<string, number>();
  const duplicates: string[] = [];

  for (const row of rows) {
    const code = normalizeStoreCode(row.store_code);
    const count = (map.get(code) ?? 0) + 1;
    map.set(code, count);
    if (count === 2) duplicates.push(code);
  }

  return duplicates;
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const index = headers.indexOf(normalizeHeader(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

type AutoSyncStatus = {
  supported: boolean;
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  logTail: string[];
};

export default function StoreMasterPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // auto-sync state
  const [syncStatus, setSyncStatus] = useState<AutoSyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/store-master/auto-sync/status");
      const json = await res.json();
      if (json.ok) setSyncStatus(json);
    } catch {}
  }, []);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  useEffect(() => {
    if (!syncStatus?.running) return;
    const interval = setInterval(fetchSyncStatus, 3000);
    return () => clearInterval(interval);
  }, [syncStatus?.running, fetchSyncStatus]);

  const startSync = async () => {
    setSyncBusy(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/admin/store-master/auto-sync/start", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "자동 동기화 시작에 실패했습니다.");
      if (json.alreadyRunning) {
        setSyncMessage("이미 실행 중입니다.");
      } else {
        setSyncMessage("자동 동기화를 시작했습니다. Chrome 창이 열립니다.");
      }
      await fetchSyncStatus();
    } catch (error: any) {
      setSyncMessage(error?.message ?? String(error));
    } finally {
      setSyncBusy(false);
    }
  };

  const stopSync = async () => {
    setSyncBusy(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/admin/store-master/auto-sync/stop", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "중단 실패");
      setSyncMessage("자동 동기화를 중단했습니다.");
      await fetchSyncStatus();
    } catch (error: any) {
      setSyncMessage(error?.message ?? String(error));
    } finally {
      setSyncBusy(false);
    }
  };

  const uploadableRows = useMemo(
    () => rowsAll.filter((row) => !!String(row.car_no ?? "").trim()),
    [rowsAll]
  );

  const skippedNoCar = useMemo(
    () => rowsAll.length - uploadableRows.length,
    [rowsAll.length, uploadableRows.length]
  );

  const openPicker = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const resetFile = () => {
    if (busy) return;
    setFileName("");
    setRowsAll([]);
    setDuplicates([]);
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parseExcelFile = async (file: File) => {
    setMessage("");
    setRowsAll([]);
    setDuplicates([]);
    setFileName(file.name);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      setMessage("엑셀 시트를 읽지 못했습니다.");
      return;
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as unknown[][];
    if (!rows || rows.length < 2) {
      setMessage("엑셀에 데이터가 없습니다.");
      return;
    }

    const headers = rows[0].map((cell) => normalizeHeader(cell));
    const idxCar = findHeaderIndex(headers, ["호차번호", "차량번호"]);
    const idxSeq = findHeaderIndex(headers, ["배송순서", "순번"]);
    const idxCode = findHeaderIndex(headers, ["배송처코드", "점포코드"]);
    const idxName = findHeaderIndex(headers, ["배송처명", "점포명"]);
    const idxDue = findHeaderIndex(headers, ["납기기준시간", "기준시간", "납품시간", "납품예정시간", "delivery_due_time"]);
    const idxAddress = findHeaderIndex(headers, ["주소", "배송처주소", "address"]);

    if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
      setMessage("필수 컬럼을 찾지 못했습니다. 호차번호, 배송순서, 배송처코드, 배송처명이 필요합니다.");
      return;
    }

    const parsed: Row[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const line = rows[i];
      if (!line) continue;

      const car_no = String(line[idxCar] ?? "").trim();
      const seq_no = Number(String(line[idxSeq] ?? "").trim());
      const store_code = normalizeStoreCode(line[idxCode]);
      const store_name = String(line[idxName] ?? "").trim();

      if (!store_code && !store_name && !car_no) continue;
      if (!store_code) continue;

      parsed.push({
        store_code,
        store_name,
        car_no,
        seq_no: Number.isFinite(seq_no) ? seq_no : 0,
        delivery_due_time: idxDue >= 0 ? String(line[idxDue] ?? "").trim() : "",
        address: idxAddress >= 0 ? String(line[idxAddress] ?? "").trim() : "",
      });
    }

    const nextDuplicates = findDuplicates(parsed);
    setRowsAll(parsed);
    setDuplicates(nextDuplicates);

    if (nextDuplicates.length > 0) {
      setMessage(`중복 점포코드가 ${nextDuplicates.length}개 있습니다. 중복을 정리한 뒤 다시 업로드해주세요.`);
      return;
    }

    setMessage(`로드 완료: 총 ${parsed.length}건 / 업로드 가능 ${parsed.filter((row) => !!row.car_no).length}건`);
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    await parseExcelFile(file);
  };

  const onDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setDragOver(true);
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setDragOver(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  };

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await parseExcelFile(file);
  };

  const applyToDB = async () => {
    setMessage("");

    if (rowsAll.length === 0) {
      setMessage("먼저 엑셀 파일을 업로드해주세요.");
      return;
    }

    if (duplicates.length > 0) {
      alert(`중복 점포코드가 있어 업로드를 막습니다.\n\n${duplicates.slice(0, 20).join(", ")}${duplicates.length > 20 ? "\n..." : ""}`);
      return;
    }

    if (uploadableRows.length === 0) {
      setMessage("업로드 가능한 데이터가 없습니다. 차량번호가 있는 행만 반영됩니다.");
      return;
    }

    for (const row of uploadableRows) {
      if (!row.store_code) {
        setMessage("점포코드가 비어 있는 행이 있습니다.");
        return;
      }
      if (!row.store_name) {
        setMessage(`점포명이 비어 있습니다. (${row.store_code})`);
        return;
      }
      if (!row.car_no) {
        setMessage(`차량번호가 비어 있습니다. (${row.store_code})`);
        return;
      }
      if (!Number.isFinite(row.seq_no) || row.seq_no <= 0) {
        setMessage(`배송순서가 올바르지 않습니다. (${row.store_code})`);
        return;
      }
    }

    if (!confirm(`점포마스터를 DB에 반영할까요?\n총 ${uploadableRows.length}건 반영 / 차량번호 없음 제외 ${skippedNoCar}건\n\n※ 이번 파일에 없는 기존 점포는 DB에서 삭제됩니다.`)) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/store-master/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: uploadableRows }),
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.message || "DB 반영에 실패했습니다.");
      }

      setMessage(`DB 반영 완료: 반영 ${json.count}건 / 삭제 ${json.deleted}건`);
      alert(`DB 반영 완료: 반영 ${json.count}건 / 삭제 ${json.deleted}건`);
    } catch (error: any) {
      const nextMessage = error?.message ?? String(error);
      setMessage(nextMessage);
      alert(nextMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontWeight: 900, fontSize: 32, letterSpacing: -0.4 }}>점포마스터 관리</h1>

      {/* elogis 자동 동기화 */}
      <h2 style={{ marginTop: 18, fontWeight: 900, fontSize: 22 }}>elogis 자동 동기화</h2>

      <div style={{ marginTop: 12, border: "1px solid #E5E7EB", borderRadius: 0, padding: 16, background: "#fff" }}>
        {syncStatus?.supported === false ? (
          <div style={{ color: "#92400E", background: "#FFFBEB", border: "1px solid #FCD34D", padding: 12, fontWeight: 700 }}>
            이 기능은 로컬 PC에서만 사용 가능합니다. (배포 환경 미지원)
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: syncStatus?.running ? "#16A34A" : "#9CA3AF",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 900, fontSize: 14 }}>
                  {syncStatus?.running ? "동기화 실행 중..." : "대기 중"}
                </span>
                {syncStatus?.running && syncStatus.startedAt && (
                  <span style={{ color: "#6B7280", fontSize: 12 }}>
                    (시작: {new Date(syncStatus.startedAt).toLocaleTimeString("ko-KR")})
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {!syncStatus?.running ? (
                  <button
                    onClick={startSync}
                    disabled={syncBusy}
                    style={{
                      height: 40,
                      padding: "0 18px",
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: 13,
                      cursor: syncBusy ? "not-allowed" : "pointer",
                      borderRadius: 0,
                    }}
                  >
                    {syncBusy ? "처리 중..." : "elogis에서 자동 가져오기"}
                  </button>
                ) : (
                  <button
                    onClick={stopSync}
                    disabled={syncBusy}
                    style={{
                      height: 40,
                      padding: "0 18px",
                      border: "1px solid #B91C1C",
                      background: "#B91C1C",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: 13,
                      cursor: syncBusy ? "not-allowed" : "pointer",
                      borderRadius: 0,
                    }}
                  >
                    중단
                  </button>
                )}

                <button
                  onClick={fetchSyncStatus}
                  disabled={syncBusy}
                  style={{
                    height: 40,
                    padding: "0 14px",
                    border: "1px solid #CBD5E1",
                    background: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: syncBusy ? "not-allowed" : "pointer",
                    borderRadius: 0,
                  }}
                >
                  새로고침
                </button>
              </div>
            </div>

            {syncMessage && (
              <div style={{ marginTop: 10, fontWeight: 700, color: "#111827" }}>{syncMessage}</div>
            )}

            <div style={{ marginTop: 10, color: "#6B7280", fontSize: 12 }}>
              Chrome 창이 열리며 elogis → TMS → 노선-점포 매핑에서 엑셀을 다운로드하여 DB에 자동 반영합니다.
              로그인이 필요한 경우 브라우저에서 직접 로그인하면 이어서 진행됩니다.
            </div>

            {syncStatus?.logTail && syncStatus.logTail.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  background: "#0F172A",
                  color: "#E2E8F0",
                  borderRadius: 0,
                  padding: 12,
                  fontSize: 12,
                  fontFamily: "monospace",
                  maxHeight: 200,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {syncStatus.logTail.join("\n")}
              </div>
            )}
          </>
        )}
      </div>

      <h2 style={{ marginTop: 32, fontWeight: 900, fontSize: 22 }}>점포마스터 최신본 엑셀 업로드</h2>

      <div style={{ marginTop: 16, border: "1px solid #E5E7EB", borderRadius: 0, padding: 14, background: "#fff" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 460 }}>
            <div
              onClick={openPicker}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") openPicker();
              }}
              style={{
                border: dragOver ? "2px solid #2563EB" : "2px dashed #CBD5E1",
                borderRadius: 0,
                padding: "14px 14px",
                cursor: busy ? "not-allowed" : "pointer",
                background: dragOver ? "#EFF6FF" : "#F8FAFC",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                boxShadow: dragOver ? "0 0 0 4px rgba(37, 99, 235, 0.12)" : "none",
                transition: "all 120ms ease",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "#111827", fontSize: 14 }}>
                  {fileName ? "선택한 파일" : dragOver ? "여기에 놓으면 업로드됩니다" : "엑셀 파일을 선택하세요"}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: fileName ? "#111827" : "#6B7280",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 260,
                  }}
                  title={fileName || "엑셀(.xlsx/.xls) 업로드"}
                >
                  {fileName || "클릭 또는 드래그앤드롭 (.xlsx / .xls)"}
                </div>
              </div>

              <div
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 0,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {fileName ? "파일 바꾸기" : "파일 선택"}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
              style={{ display: "none" }}
              disabled={busy}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            <button
              onClick={resetFile}
              disabled={busy || (!fileName && rowsAll.length === 0)}
              style={{
                height: 44,
                padding: "0 16px",
                borderRadius: 0,
                border: "1px solid #CBD5E1",
                background: "#fff",
                fontWeight: 900,
                cursor: busy || (!fileName && rowsAll.length === 0) ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              초기화
            </button>

            <button
              onClick={applyToDB}
              disabled={busy || uploadableRows.length === 0 || duplicates.length > 0}
              style={{
                height: 44,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #111827",
                background: duplicates.length > 0 ? "#E5E7EB" : "#111827",
                color: "#fff",
                cursor: busy || uploadableRows.length === 0 || duplicates.length > 0 ? "not-allowed" : "pointer",
                fontWeight: 900,
                fontSize: 14,
                whiteSpace: "nowrap",
              }}
            >
              {busy ? "반영 중..." : "점포마스터 DB 반영"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, color: duplicates.length > 0 ? "#B91C1C" : "#111827", fontWeight: 700 }}>{message}</div>

        {duplicates.length > 0 ? (
          <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", padding: 12, borderRadius: 0 }}>
            <div style={{ fontWeight: 900, color: "#B91C1C" }}>중복 점포코드 목록</div>
            <div style={{ marginTop: 6, color: "#B91C1C" }}>
              {duplicates.slice(0, 50).join(", ")}
              {duplicates.length > 50 ? " ..." : ""}
            </div>
            <div style={{ marginTop: 6, color: "#6B7280" }}>중복을 정리한 뒤 다시 업로드해주세요.</div>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 12,
            borderRadius: 0,
            padding: 12,
            background: "#F8FAFC",
            border: "1px solid #E5E7EB",
            color: "#111827",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 900 }}>요약</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#374151" }}>
            총 <b>{rowsAll.length}</b>건 / 업로드 가능 <b>{uploadableRows.length}</b>건 / 차량번호 없음 제외 <b>{skippedNoCar}</b>건
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontWeight: 900, fontSize: 16 }}>업로드 전체 목록</h3>

        <div style={{ overflow: "auto", border: "1px solid #E5E7EB", borderRadius: 0, background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>차량번호</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>배송순서</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>점포코드</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>점포명</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rowsAll.map((row, index) => {
                const okCar = !!String(row.car_no ?? "").trim();
                return (
                  <tr key={`${row.store_code}-${index}`} style={{ background: index % 2 === 0 ? "#fff" : "#FCFCFD" }}>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{row.car_no}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{row.seq_no}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{row.store_code}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{row.store_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6", fontWeight: 900, color: okCar ? "#047857" : "#B91C1C" }}>
                      {okCar ? "업로드 대상" : "차량번호 없음 제외"}
                    </td>
                  </tr>
                );
              })}

              {rowsAll.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "#6B7280" }}>
                    업로드한 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, color: "#6B7280", fontSize: 12 }}>
          차량번호가 비어 있는 행은 <b>DB 반영에서 자동 제외</b>됩니다.
        </div>
      </div>
    </div>
  );
}
