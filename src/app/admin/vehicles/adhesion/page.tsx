"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type AdhesionDriverStat = {
  name: string;
  adhesionRate: string;
  cumulativeRate: string;
};

type AdhesionStoreStat = {
  storeName: string;
  postGrade: string;
  category: string;
};

type AdhesionSnapshot = {
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  driverStats: AdhesionDriverStat[];
  storeStats: AdhesionStoreStat[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function findHeaderRow(rows: unknown[][], labels: string[]) {
  return rows.findIndex((row) => {
    const headers = row.map((cell) => normalizeHeader(cell));
    return labels.every((label) => headers.includes(normalizeHeader(label)));
  });
}

function getCell(row: unknown[], headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const index = headers.indexOf(normalizeHeader(candidate));
    if (index >= 0) return String(row[index] ?? "").trim();
  }
  return "";
}

async function parseAdhesionWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });

  const dailyShareSheet = workbook.Sheets["일일공유"];
  const dailyAdhesionSheet = workbook.Sheets["일일점착"];
  if (!dailyShareSheet || !dailyAdhesionSheet) {
    throw new Error("일일공유 또는 일일점착 시트를 찾지 못했습니다.");
  }

  const dailyShareRows = XLSX.utils.sheet_to_json(dailyShareSheet, { header: 1, raw: false, blankrows: false }) as unknown[][];
  const dailyAdhesionRows = XLSX.utils.sheet_to_json(dailyAdhesionSheet, { header: 1, raw: false, blankrows: false }) as unknown[][];

  const shareHeaderRowIndex = findHeaderRow(dailyShareRows, ["이름", "점착율", "점착누계"]);
  const adhesionHeaderRowIndex = findHeaderRow(dailyAdhesionRows, ["점포명", "소명후등급", "비고"]);

  if (shareHeaderRowIndex < 0) throw new Error("일일공유 시트에서 이름/점착율/점착누계 컬럼을 찾지 못했습니다.");
  if (adhesionHeaderRowIndex < 0) throw new Error("일일점착 시트에서 점포명/소명후등급/비고 컬럼을 찾지 못했습니다.");

  const shareHeaders = dailyShareRows[shareHeaderRowIndex].map((cell) => normalizeHeader(cell));
  const adhesionHeaders = dailyAdhesionRows[adhesionHeaderRowIndex].map((cell) => normalizeHeader(cell));

  const driverMap = new Map<string, AdhesionDriverStat>();
  for (const row of dailyShareRows.slice(shareHeaderRowIndex + 1)) {
    const name = getCell(row, shareHeaders, ["이름"]);
    if (!name) continue;
    driverMap.set(normalizeName(name), {
      name,
      adhesionRate: getCell(row, shareHeaders, ["점착율", "점착률"]),
      cumulativeRate: getCell(row, shareHeaders, ["점착누계", "누계"]),
    });
  }

  const storeMap = new Map<string, AdhesionStoreStat>();
  for (const row of dailyAdhesionRows.slice(adhesionHeaderRowIndex + 1)) {
    const storeName = getCell(row, adhesionHeaders, ["점포명"]);
    if (!storeName) continue;
    storeMap.set(normalizeName(storeName), {
      storeName,
      postGrade: getCell(row, adhesionHeaders, ["소명후등급", "변경점착등급"]),
      category: getCell(row, adhesionHeaders, ["비고", "구분"]),
    });
  }

  return {
    fileName: file.name,
    driverStats: [...driverMap.values()],
    storeStats: [...storeMap.values()],
  };
}

async function getAdminToken() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("로그인 세션이 없습니다.");
}

async function fetchAdhesionSnapshot() {
  const token = await getAdminToken();
  const response = await fetch("/api/admin/vehicles/adhesion", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; snapshot?: AdhesionSnapshot | null };
  if (!response.ok || !payload.ok) throw new Error(payload.message || "점착 데이터를 불러오지 못했습니다.");
  return payload.snapshot ?? null;
}

async function saveAdhesionSnapshot(snapshot: Omit<AdhesionSnapshot, "uploadedAt" | "uploadedBy">) {
  const token = await getAdminToken();
  const response = await fetch("/api/admin/vehicles/adhesion", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; snapshot?: AdhesionSnapshot };
  if (!response.ok || !payload.ok || !payload.snapshot) throw new Error(payload.message || "점착 저장에 실패했습니다.");
  return payload.snapshot;
}

export default function VehicleAdhesionPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<AdhesionSnapshot | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const saved = await fetchAdhesionSnapshot();
        setSnapshot(saved);
      } catch (error) {
        setMessage((error as Error)?.message ?? "점착 데이터를 불러오지 못했습니다.");
      }
    })();
  }, []);

  const counts = useMemo(
    () => ({
      drivers: snapshot?.driverStats.length ?? 0,
      stores: snapshot?.storeStats.length ?? 0,
    }),
    [snapshot]
  );

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMessage("");

    try {
      const parsed = await parseAdhesionWorkbook(file);
      const saved = await saveAdhesionSnapshot(parsed);
      setSnapshot(saved);
      setMessage(`점착 데이터 저장 완료: 기사 ${saved.driverStats.length}명 / 점포 ${saved.storeStats.length}건`);
    } catch (error) {
      setMessage((error as Error)?.message ?? "점착 파일 처리에 실패했습니다.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #d6e4ee",
    borderRadius: 18,
    background: "#fff",
    padding: 20,
    boxShadow: "0 18px 34px rgba(15, 41, 64, 0.08)",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "12px 14px",
    borderBottom: "1px solid #e5edf3",
    color: "#26465a",
    fontSize: 13,
    fontWeight: 900,
    background: "#f8fbfd",
  };

  const tdStyle: React.CSSProperties = {
    padding: "11px 14px",
    borderBottom: "1px solid #eef3f7",
    color: "#113247",
    fontSize: 13,
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(event) => void onPickFile(event.target.files?.[0] ?? null)}
      />

      <div
        style={{
          border: "1px solid #cfe0ea",
          borderRadius: 22,
          padding: "18px 22px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,251,255,0.98) 100%)",
          boxShadow: "0 22px 50px rgba(15, 41, 64, 0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 950, color: "#0f2940", letterSpacing: -0.5 }}>차량 점착</div>
            <div style={{ marginTop: 8, color: "#35546a", fontSize: 14, lineHeight: 1.6, fontWeight: 700 }}>
              `일일공유`에서 기사명 기준 점착률/누계를, `일일점착`에서 점포명 기준 소명후등급/비고를 읽어 운행일보에 반영합니다.
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            style={{
              height: 44,
              padding: "0 18px",
              borderRadius: 14,
              border: "1px solid #0f766e",
              background: busy ? "#cbd5e1" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
              color: "#fff",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "처리 중..." : "점착 파일 업로드"}
          </button>
        </div>

        <div style={{ marginTop: 12, color: "#29485e", fontSize: 13, fontWeight: 700 }}>
          {snapshot?.fileName ? `현재 파일: ${snapshot.fileName}` : "일일공유/일일점착이 들어 있는 점착 파일을 올려 주세요."}
        </div>
        {message ? <div style={{ marginTop: 8, color: "#103b53", fontSize: 13, fontWeight: 700 }}>{message}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {[
          { label: "기사 점착률", value: `${counts.drivers}명` },
          { label: "점포 등급", value: `${counts.stores}건` },
          { label: "업로드 파일", value: snapshot?.fileName || "-" },
          { label: "업로드 시각", value: snapshot?.uploadedAt ? snapshot.uploadedAt.slice(0, 16).replace("T", " ") : "-" },
        ].map((item) => (
          <div key={item.label} style={cardStyle}>
            <div style={{ color: "#678092", fontSize: 12, fontWeight: 800 }}>{item.label}</div>
            <div style={{ marginTop: 8, color: "#0f2940", fontSize: 24, fontWeight: 950, wordBreak: "break-word" }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#103b53" }}>기사명 기준</div>
        <div style={{ marginTop: 6, color: "#5a7385", fontSize: 13, fontWeight: 700 }}>
          운행일보 상단 `점착률`, `누계`에 반영됩니다.
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>점착률</th>
                <th style={thStyle}>누계</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot?.driverStats ?? []).slice(0, 20).map((row) => (
                <tr key={row.name}>
                  <td style={tdStyle}>{row.name}</td>
                  <td style={tdStyle}>{row.adhesionRate}</td>
                  <td style={tdStyle}>{row.cumulativeRate}</td>
                </tr>
              ))}
              {!snapshot?.driverStats.length ? (
                <tr>
                  <td colSpan={3} style={tdStyle}>업로드된 기사 점착 데이터가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#103b53" }}>점포명 기준</div>
        <div style={{ marginTop: 6, color: "#5a7385", fontSize: 13, fontWeight: 700 }}>
          운행일보 하단 `등급`, `구분`에 반영됩니다.
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>점포명</th>
                <th style={thStyle}>소명후등급</th>
                <th style={thStyle}>비고</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot?.storeStats ?? []).slice(0, 30).map((row) => (
                <tr key={row.storeName}>
                  <td style={tdStyle}>{row.storeName}</td>
                  <td style={tdStyle}>{row.postGrade}</td>
                  <td style={tdStyle}>{row.category}</td>
                </tr>
              ))}
              {!snapshot?.storeStats.length ? (
                <tr>
                  <td colSpan={3} style={tdStyle}>업로드된 점포 점착 데이터가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
