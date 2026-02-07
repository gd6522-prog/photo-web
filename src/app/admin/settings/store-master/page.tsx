"use client";

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
};

function normalizeHeader(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function normalizeStoreCode(v: any) {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function findDuplicates(rows: Row[]) {
  const map = new Map<string, number>();
  const dups: string[] = [];
  for (const r of rows) {
    const code = normalizeStoreCode(r.store_code);
    const c = (map.get(code) ?? 0) + 1;
    map.set(code, c);
    if (c === 2) dups.push(code);
  }
  return dups;
}

export default function StoreMasterPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [dragOver, setDragOver] = useState(false);

  const uploadableRows = useMemo(
    () => rowsAll.filter((r) => !!String(r.car_no ?? "").trim()),
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
    setMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parseExcelFile = async (f: File) => {
    setMsg("");
    setRowsAll([]);
    setDuplicates([]);
    setFileName(f.name);

    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    if (!ws) {
      setMsg("엑셀 시트를 읽지 못했습니다.");
      return;
    }

    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];
    if (!aoa || aoa.length < 2) {
      setMsg("엑셀에 데이터가 없습니다.");
      return;
    }

    const headerRow = aoa[0];
    const headers = headerRow.map((h) => normalizeHeader(h));

    const idxCar =
      headers.indexOf(normalizeHeader("호차번호")) >= 0
        ? headers.indexOf(normalizeHeader("호차번호"))
        : headers.indexOf(normalizeHeader("호차"));

    const idxSeq =
      headers.indexOf(normalizeHeader("배송순서")) >= 0
        ? headers.indexOf(normalizeHeader("배송순서"))
        : headers.indexOf(normalizeHeader("순번"));

    const idxCode =
      headers.indexOf(normalizeHeader("배송처코드")) >= 0
        ? headers.indexOf(normalizeHeader("배송처코드"))
        : headers.indexOf(normalizeHeader("점포코드"));

    const idxName =
      headers.indexOf(normalizeHeader("배송처명")) >= 0
        ? headers.indexOf(normalizeHeader("배송처명"))
        : headers.indexOf(normalizeHeader("점포명"));

    if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
      setMsg("엑셀 컬럼을 찾지 못했습니다. 필요한 컬럼: 호차번호, 배송순서*, 배송처코드, 배송처명");
      return;
    }

    const out: Row[] = [];
    for (let r = 1; r < aoa.length; r++) {
      const line = aoa[r];
      if (!line) continue;

      const car_no = String(line[idxCar] ?? "").trim();
      const seq_no = Number(String(line[idxSeq] ?? "").trim());
      const store_code = normalizeStoreCode(line[idxCode]);
      const store_name = String(line[idxName] ?? "").trim();

      if (!store_code && !store_name && !car_no) continue;
      if (!store_code) continue;

      out.push({
        store_code,
        store_name,
        car_no,
        seq_no: Number.isFinite(seq_no) ? seq_no : 0,
      });
    }

    const dups = findDuplicates(out);
    setRowsAll(out);
    setDuplicates(dups);

    if (dups.length > 0) {
      setMsg(`중복 점포코드가 ${dups.length}개 있습니다. 중복 해결 전까지 DB 반영 불가`);
    } else {
      setMsg(`로드 완료: 총 ${out.length}건 / 업로드 가능 ${out.filter((x) => !!x.car_no).length}건`);
    }
  };

  const onPickFile = async (f: File | null) => {
    if (!f) return;
    await parseExcelFile(f);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    await parseExcelFile(f);
  };

  const applyToDB = async () => {
    setMsg("");

    if (rowsAll.length === 0) {
      setMsg("먼저 엑셀 파일을 업로드하세요.");
      return;
    }
    if (duplicates.length > 0) {
      alert(
        `중복 점포코드가 있어 업로드를 막았습니다.\n\n중복 코드 예:\n${duplicates.slice(0, 20).join(", ")}${
          duplicates.length > 20 ? "\n..." : ""
        }`
      );
      return;
    }
    if (uploadableRows.length === 0) {
      setMsg("업로드 가능한 데이터가 없습니다. (호차번호 비어있는 행만 존재)");
      return;
    }

    for (const r of uploadableRows) {
      if (!r.store_code) return setMsg("점포코드가 비어있는 행이 있습니다.");
      if (!r.store_name) return setMsg(`점포명이 비어있습니다. (${r.store_code})`);
      if (!r.car_no) return setMsg(`호차번호가 비어있습니다. (${r.store_code})`);
      if (!Number.isFinite(r.seq_no) || r.seq_no <= 0) return setMsg(`순번이 올바르지 않습니다. (${r.store_code})`);
    }

    if (!confirm(`점포마스터를 DB에 반영할까요?\n총 ${uploadableRows.length}건 (호차번호 비어 제외: ${skippedNoCar}건)`)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/store-master/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: uploadableRows }),
      });
      const json = await res.json();

      if (!json.ok) {
        if (json.duplicates?.length) {
          alert(
            `서버에서 중복을 감지하여 반영을 중단했습니다.\n\n중복 코드 예:\n${json.duplicates
              .slice(0, 20)
              .join(", ")}${json.duplicates.length > 20 ? "\n..." : ""}`
          );
        }
        throw new Error(json.message || "반영 실패");
      }

      setMsg(`DB 반영 완료: ${json.count}건 (호차번호 비어 제외: ${json.skippedNoCar ?? skippedNoCar}건)`);
      alert(`DB 반영 완료: ${json.count}건`);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200 }}>
      <h2 style={{ fontWeight: 900, fontSize: 22 }}>점포마스터 최신화 (엑셀 업로드)</h2>

      <p style={{ color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>
        엑셀에서 <b>호차번호, 배송순서*, 배송처코드, 배송처명</b>만 추려서 <b>store_map</b>에 반영합니다.
        <br />
        <b>검수점포 설정은 여기서 하지 않습니다.</b> (검수점포 최신화 메뉴에서 별도 관리)
        <br />
        <b>점포코드 중복이 있으면 반영이 막히고 오류로 표시됩니다.</b>
      </p>

      <div style={{ marginTop: 16, border: "1px solid #E5E7EB", borderRadius: 16, padding: 14, background: "white" }}>
        {/* ✅ 업로드 박스를 더 짧게 (maxWidth 460) */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 460 }}>
            <div
              onClick={openPicker}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openPicker();
              }}
              style={{
                border: dragOver ? "2px solid #2563EB" : "2px dashed #CBD5E1",
                borderRadius: 14,
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
                  {fileName ? "선택된 파일" : dragOver ? "여기에 놓으면 업로드돼요" : "엑셀 파일을 선택하세요"}
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
                  borderRadius: 12,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
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
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
              disabled={busy}
            />
          </div>

          {/* ✅ 오른쪽 버튼 고정 */}
          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            <button
              onClick={resetFile}
              disabled={busy || (!fileName && rowsAll.length === 0)}
              style={{
                height: 44,
                padding: "0 16px",
                borderRadius: 12,
                border: "1px solid #CBD5E1",
                background: "white",
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
                borderRadius: 12,
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

        <div style={{ marginTop: 12, color: duplicates.length > 0 ? "#B91C1C" : "#111827", fontWeight: 700 }}>
          {msg}
        </div>

        {duplicates.length > 0 && (
          <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900, color: "#B91C1C" }}>중복 점포코드 목록(일부)</div>
            <div style={{ marginTop: 6, color: "#B91C1C" }}>
              {duplicates.slice(0, 50).join(", ")}
              {duplicates.length > 50 ? " ..." : ""}
            </div>
            <div style={{ marginTop: 6, color: "#6B7280" }}>
              중복을 엑셀에서 정리한 뒤 다시 업로드해야 합니다. (중복 상태에서는 DB 반영 불가)
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            borderRadius: 12,
            padding: 12,
            background: "#F8FAFC",
            border: "1px solid #E5E7EB",
            color: "#111827",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 900 }}>요약</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#374151" }}>
            총 <b>{rowsAll.length}</b>건 / 업로드 가능 <b>{uploadableRows.length}</b>건 / 호차번호 비어 제외 <b>{skippedNoCar}</b>건
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontWeight: 900, fontSize: 16 }}>업로드 전체 목록</h3>

        <div style={{ overflow: "auto", border: "1px solid #E5E7EB", borderRadius: 14, background: "white" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>호차번호</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>순번</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>점포코드</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>점포명</th>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #E5E7EB" }}>상태</th>
              </tr>
            </thead>

            <tbody>
              {rowsAll.map((r, i) => {
                const okCar = !!String(r.car_no ?? "").trim();
                return (
                  <tr key={`${r.store_code}-${i}`} style={{ background: i % 2 === 0 ? "white" : "#FCFCFD" }}>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{r.car_no}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{r.seq_no}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{r.store_code}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6" }}>{r.store_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #F3F4F6", fontWeight: 900, color: okCar ? "#047857" : "#B91C1C" }}>
                      {okCar ? "업로드 대상" : "호차번호 비어 제외"}
                    </td>
                  </tr>
                );
              })}

              {rowsAll.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "#6B7280" }}>
                    업로드한 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, color: "#6B7280", fontSize: 12 }}>
          ※ 호차번호가 비어있는 행은 <b>DB 반영에서 자동 제외</b>됩니다.
        </div>
      </div>
    </div>
  );
}
