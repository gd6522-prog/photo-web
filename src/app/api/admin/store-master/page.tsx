"use client";

import React, { useMemo, useState } from "react";
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

// 엑셀에서 "점포코드"가 숫자로 읽히면 앞의 0이 날아가서 보정
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
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // 미리보기는 상위 200개만
  const preview = useMemo(() => rows.slice(0, 200), [rows]);

  const onPickFile = async (f: File | null) => {
    setMsg("");
    setRows([]);
    setDuplicates([]);
    setFileName("");

    if (!f) return;
    setFileName(f.name);

    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      setMsg("엑셀 시트를 읽지 못했습니다.");
      return;
    }

    // header: 1 => 2차원 배열(첫 행이 헤더)
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];
    if (!aoa || aoa.length < 2) {
      setMsg("엑셀에 데이터가 없습니다.");
      return;
    }

    const headerRow = aoa[0];
    const headers = headerRow.map((h) => normalizeHeader(h));

    // 네 파일에서 우리가 뽑을 헤더(가능한 이름들을 모두 허용)
    // - 호차번호
    // - 배송순서* (별표 제거해서 '배송순서')
    // - 배송처코드
    // - 배송처명
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
      setMsg(
        "엑셀 컬럼을 찾지 못했습니다. 필요한 컬럼: 호차번호, 배송순서*, 배송처코드, 배송처명"
      );
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

      // 완전 빈 행은 스킵
      if (!store_code && !store_name && !car_no) continue;

      // 최소값 체크(비어있으면 나중에 반영 단계에서 막히지만, 여기서도 걸러줌)
      if (!store_code) continue;

      out.push({
        store_code,
        store_name,
        car_no,
        seq_no: Number.isFinite(seq_no) ? seq_no : 0,
      });
    }

    const dups = findDuplicates(out);
    setRows(out);
    setDuplicates(dups);

    if (dups.length > 0) {
      setMsg(`중복 점포코드가 ${dups.length}개 있습니다. 중복을 해결하기 전까지 DB 반영이 불가능합니다.`);
    } else {
      setMsg(`로드 완료: ${out.length}건 (중복 없음)`);
    }
  };

  const applyToDB = async () => {
    setMsg("");
    if (rows.length === 0) {
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

    // 최소 검증
    for (const r of rows) {
      if (!r.store_code) {
        setMsg("점포코드가 비어있는 행이 있습니다.");
        return;
      }
      if (!r.store_name) {
        setMsg(`점포명이 비어있습니다. (${r.store_code})`);
        return;
      }
      if (!r.car_no) {
        setMsg(`호차번호가 비어있습니다. (${r.store_code})`);
        return;
      }
      if (!Number.isFinite(r.seq_no) || r.seq_no <= 0) {
        setMsg(`순번이 올바르지 않습니다. (${r.store_code})`);
        return;
      }
    }

    if (!confirm(`DB에 반영할까요?\n총 ${rows.length}건`)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/store-master/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!json.ok) {
        // 서버 중복 체크에서 막히는 경우도 처리
        if (json.duplicates?.length) {
          alert(
            `서버에서 중복을 감지하여 반영을 중단했습니다.\n\n중복 코드 예:\n${json.duplicates
              .slice(0, 20)
              .join(", ")}${json.duplicates.length > 20 ? "\n..." : ""}`
          );
        }
        throw new Error(json.message || "반영 실패");
      }
      setMsg(`DB 반영 완료: ${json.count}건`);
      alert(`DB 반영 완료: ${json.count}건`);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000 }}>
      <h2 style={{ fontWeight: 900, fontSize: 20 }}>점포마스터 최신화 (엑셀 업로드)</h2>
      <p style={{ color: "#6B7280", marginTop: 6 }}>
        엑셀에서 <b>호차번호, 배송순서*, 배송처코드, 배송처명</b>만 추려서 store_map에 반영합니다.
        <br />
        <b>점포코드 중복이 있으면 반영이 막히고 오류로 표시됩니다.</b>
      </p>

      <div style={{ marginTop: 16, border: "1px solid #E5E7EB", borderRadius: 0, padding: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {fileName && <span style={{ color: "#111827", fontWeight: 700 }}>{fileName}</span>}
        </div>

        <div style={{ marginTop: 10, color: duplicates.length > 0 ? "#B91C1C" : "#111827" }}>
          {msg}
        </div>

        {duplicates.length > 0 && (
          <div style={{ marginTop: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", padding: 10, borderRadius: 0 }}>
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

        <button
          onClick={applyToDB}
          disabled={busy || rows.length === 0 || duplicates.length > 0}
          style={{
            marginTop: 12,
            height: 40,
            padding: "0 14px",
            borderRadius: 0,
            border: "1px solid #111827",
            background: duplicates.length > 0 ? "#E5E7EB" : "#111827",
            color: "#fff",
            cursor: busy || rows.length === 0 || duplicates.length > 0 ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          {busy ? "반영 중..." : "DB 반영"}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontWeight: 900, fontSize: 16 }}>미리보기 (상위 200건)</h3>
        <div style={{ overflow: "auto", border: "1px solid #E5E7EB", borderRadius: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #E5E7EB" }}>호차번호</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #E5E7EB" }}>순번</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #E5E7EB" }}>점포코드</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #E5E7EB" }}>점포명</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={`${r.store_code}-${i}`}>
                  <td style={{ padding: 10, borderBottom: "1px solid #F3F4F6" }}>{r.car_no}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #F3F4F6" }}>{r.seq_no}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #F3F4F6" }}>{r.store_code}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #F3F4F6" }}>{r.store_name}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, color: "#6B7280" }}>
                    업로드한 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 200 && <div style={{ marginTop: 6, color: "#6B7280" }}>총 {rows.length}건 중 200건만 표시 중</div>}
      </div>
    </div>
  );
}
