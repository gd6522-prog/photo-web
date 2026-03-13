"use client";

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time: string;
  address: string;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
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

export default function StoreMasterPage() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [skippedNoCar, setSkippedNoCar] = useState(0);
  const [inspectionSet, setInspectionSet] = useState<Set<string>>(new Set());

  const preview = useMemo(() => rows, [rows]);

  const onPickFile = async (file: File | null) => {
    setMsg("");
    setRows([]);
    setDuplicates([]);
    setFileName("");
    setSkippedNoCar(0);
    setInspectionSet(new Set());

    if (!file) return;
    setFileName(file.name);

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      setMsg("엑셀 시트를 읽지 못했습니다.");
      return;
    }

    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as unknown[][];
    if (!aoa || aoa.length < 2) {
      setMsg("엑셀 데이터가 없습니다.");
      return;
    }

    const headers = (aoa[0] ?? []).map((header) => normalizeHeader(header));
    const idxCar = findHeaderIndex(headers, ["호차번호", "호차", "차량번호"]);
    const idxSeq = findHeaderIndex(headers, ["배송순서", "배송순서*", "순번"]);
    const idxCode = findHeaderIndex(headers, ["배송처코드", "점포코드"]);
    const idxName = findHeaderIndex(headers, ["배송처명", "점포명"]);
    const idxDeliveryDueTime = findHeaderIndex(headers, ["납기기준시간", "기준시간"]);
    const idxAddress = findHeaderIndex(headers, ["주소"]);

    if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
      setMsg("필수 컬럼을 찾지 못했습니다. 필요 컬럼: 호차번호, 배송순서, 배송처코드, 배송처명");
      return;
    }

    const parsed: Row[] = [];
    let skipped = 0;

    for (let rowIndex = 1; rowIndex < aoa.length; rowIndex += 1) {
      const line = aoa[rowIndex];
      if (!line) continue;

      const car_no = String(line[idxCar] ?? "").trim();
      const seq_no = Number(String(line[idxSeq] ?? "").trim());
      const store_code = normalizeStoreCode(line[idxCode]);
      const store_name = String(line[idxName] ?? "").trim();
      const delivery_due_time = idxDeliveryDueTime >= 0 ? String(line[idxDeliveryDueTime] ?? "").trim() : "";
      const address = idxAddress >= 0 ? String(line[idxAddress] ?? "").trim() : "";

      if (!store_code && !store_name && !car_no) continue;
      if (!store_code) continue;

      if (!car_no) {
        skipped += 1;
        continue;
      }

      parsed.push({
        store_code,
        store_name,
        car_no,
        seq_no: Number.isFinite(seq_no) ? seq_no : 0,
        delivery_due_time,
        address,
      });
    }

    const nextDuplicates = findDuplicates(parsed);
    setRows(parsed);
    setDuplicates(nextDuplicates);
    setSkippedNoCar(skipped);

    if (nextDuplicates.length > 0) {
      setMsg(`중복 점포코드 ${nextDuplicates.length}건이 있습니다. 중복 해소 전에는 DB 반영이 막힙니다. (호차 누락 제외 ${skipped}건)`);
      return;
    }

    setMsg(`로드 완료: ${parsed.length}건 (호차 누락 제외 ${skipped}건)`);
  };

  const toggleInspection = (code: string) => {
    setInspectionSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const checkAllInspection = () => {
    setInspectionSet(new Set(rows.map((row) => row.store_code)));
  };

  const uncheckAllInspection = () => {
    setInspectionSet(new Set());
  };

  const applyToDB = async () => {
    setMsg("");

    if (rows.length === 0) {
      setMsg("먼저 엑셀 파일을 업로드해 주세요.");
      return;
    }

    if (duplicates.length > 0) {
      alert(`중복 점포코드가 있어 업로드를 막습니다.\n\n${duplicates.slice(0, 20).join(", ")}${duplicates.length > 20 ? "\n..." : ""}`);
      return;
    }

    for (const row of rows) {
      if (!row.store_code) {
        setMsg("점포코드가 비어 있는 행이 있습니다.");
        return;
      }
      if (!row.store_name) {
        setMsg(`점포명이 비어 있습니다. (${row.store_code})`);
        return;
      }
      if (!row.car_no) {
        setMsg(`호차번호가 비어 있습니다. (${row.store_code})`);
        return;
      }
      if (!Number.isFinite(row.seq_no) || row.seq_no <= 0) {
        setMsg(`배송순서가 올바르지 않습니다. (${row.store_code})`);
        return;
      }
    }

    const confirmed = window.confirm(
      `DB에 반영할까요?\n총 ${rows.length}건\n호차 누락 제외 ${skippedNoCar}건\n검수점 체크 ${inspectionSet.size}건`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch("/api/admin/store-master/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          inspectionCodes: Array.from(inspectionSet),
        }),
      });

      const json = await response.json();
      if (!json.ok) {
        if (json.duplicates?.length) {
          alert(`서버에서 중복 점포코드를 감지했습니다.\n\n${json.duplicates.slice(0, 20).join(", ")}${json.duplicates.length > 20 ? "\n..." : ""}`);
        }
        throw new Error(json.message || "DB 반영 실패");
      }

      const setInspectionCount = Number(json.setInspectionCount ?? 0);
      const doneMessage = `DB 반영 완료: ${json.count}건 / 검수점 설정: ${setInspectionCount}건`;
      setMsg(doneMessage);
      alert(doneMessage);
    } catch (error: any) {
      setMsg(error?.message ?? String(error));
      alert(error?.message ?? String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200 }}>
      <h2 style={{ fontWeight: 900, fontSize: 20 }}>점포마스터 최신값 엑셀 업로드</h2>
      <p style={{ color: "#6b7280", marginTop: 6 }}>
        엑셀에서 <b>호차번호, 배송순서, 배송처코드, 배송처명</b>은 필수로 읽고,
        <b> 납기기준시간, 주소</b>가 있으면 같이 `store_map`에 반영합니다.
        <br />
        <b>점포코드가 중복되면 반영이 막히고 오류로 표시됩니다.</b>
        <br />
        <b>호차번호가 비어 있는 행은 자동 제외됩니다.</b>
      </p>

      <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".xlsx,.xls" onChange={(event) => onPickFile(event.target.files?.[0] ?? null)} disabled={busy} />
          {fileName ? <span style={{ color: "#111827", fontWeight: 700 }}>{fileName}</span> : null}

          <button
            onClick={checkAllInspection}
            disabled={busy || rows.length === 0}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: busy || rows.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            검수점 전체 체크
          </button>

          <button
            onClick={uncheckAllInspection}
            disabled={busy || rows.length === 0}
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: busy || rows.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            체크 해제
          </button>
        </div>

        <div style={{ marginTop: 10, color: duplicates.length > 0 ? "#b91c1c" : "#111827" }}>{msg}</div>

        {skippedNoCar > 0 ? <div style={{ marginTop: 6, color: "#6b7280" }}>호차 누락 제외: {skippedNoCar}건</div> : null}

        {rows.length > 0 ? (
          <div style={{ marginTop: 6, color: "#6b7280" }}>
            검수점 체크: {inspectionSet.size}건 / 총 {rows.length}건
          </div>
        ) : null}

        {duplicates.length > 0 ? (
          <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fca5a5", padding: 10, borderRadius: 10 }}>
            <div style={{ fontWeight: 900, color: "#b91c1c" }}>중복 점포코드 목록</div>
            <div style={{ marginTop: 6, color: "#b91c1c" }}>
              {duplicates.slice(0, 50).join(", ")}
              {duplicates.length > 50 ? " ..." : ""}
            </div>
          </div>
        ) : null}

        <button
          onClick={applyToDB}
          disabled={busy || rows.length === 0 || duplicates.length > 0}
          style={{
            marginTop: 12,
            height: 40,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: busy || rows.length === 0 || duplicates.length > 0 ? "#e5e7eb" : "#111827",
            color: "#fff",
            cursor: busy || rows.length === 0 || duplicates.length > 0 ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          {busy ? "반영 중..." : "DB 반영 + 검수점 설정"}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontWeight: 900, fontSize: 16 }}>전체 보기 (총 {rows.length}건)</h3>

        <div style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, maxHeight: 520 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb", width: 80 }}>검수</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>호차번호</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>배송순서</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>점포코드</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>점포명</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>납기기준시간</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>주소</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={`${row.store_code}-${index}`}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <input
                      type="checkbox"
                      checked={inspectionSet.has(row.store_code)}
                      onChange={() => toggleInspection(row.store_code)}
                      disabled={busy}
                      style={{ width: 16, height: 16, cursor: busy ? "not-allowed" : "pointer" }}
                    />
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{row.car_no}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{row.seq_no}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{row.store_code}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{row.store_name}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{row.delivery_due_time}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{row.address}</td>
                </tr>
              ))}
              {preview.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 14, color: "#6b7280" }}>
                    업로드한 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
