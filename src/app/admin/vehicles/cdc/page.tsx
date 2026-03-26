"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type CdcRow = {
  carNo: string;
  storeCode: string;
  storeName: string;
  maxBoxNo: number;
};

type FullBoxRow = {
  storeCode: string;
  storeName: string;
  maxBoxNo: number;
};

type CdcSnapshot = {
  fileName: string;
  fullBoxFileName: string;
  deliveryDate: string;
  uploadedAt: string;
  uploadedBy: string;
  rows: CdcRow[];
  fullBoxRows: FullBoxRow[];
};

type StoreMapRow = {
  storeCode: string;
  storeName: string;
  carNo: string;
  seqNo: number;
};

type GroupedRow = {
  carNo: string;
  seqNo: number;
  storeCode: string;
  storeName: string;
  cdcBoxNo: number;
  fullBoxNo: number;
  totalBoxNo: number;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

function normalizeStoreName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function formatDeliveryDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function findHeaderIndex(headers: string[], labels: string[]) {
  for (const label of labels) {
    const index = headers.indexOf(normalizeHeader(label));
    if (index >= 0) return index;
  }
  return -1;
}

function toBoxNumber(value: unknown) {
  const digits = String(value ?? "").trim().replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits.replace(/^0+/, "") || "0");
}

function sanitizeCdcMessage(message: string) {
  const text = String(message || "").trim();
  if (!text) return "";
  if ((text.startsWith("{") || text.startsWith("[")) && text.includes('"url"') && text.includes("cdc.json")) {
    return "";
  }
  return text;
}

async function parseCdcWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) throw new Error("CDC 파일 시트를 찾지 못했습니다.");

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }) as unknown[][];
  if (!rows.length) throw new Error("CDC 파일 데이터가 없습니다.");

  const headers = (rows[0] ?? []).map((cell) => normalizeHeader(cell));
  const idxCarNo = findHeaderIndex(headers, ["호차", "차량", "차량번호", "호차번호"]);
  const idxStoreCode = findHeaderIndex(headers, ["배송거래처코드", "점포코드"]);
  const idxStoreName = findHeaderIndex(headers, ["배송거래처명", "점포명"]);
  const idxBoxNo = findHeaderIndex(headers, ["박스번호", "boxno"]);

  if (idxCarNo < 0 || idxStoreCode < 0 || idxStoreName < 0 || idxBoxNo < 0) {
    throw new Error("CDC 파일에서 호차, 점포코드, 점포명, 박스번호 컬럼을 찾지 못했습니다.");
  }

  const map = new Map<string, CdcRow>();

  for (const row of rows.slice(1)) {
    const carNo = String(row[idxCarNo] ?? "").trim();
    const storeCode = String(row[idxStoreCode] ?? "").trim();
    const storeName = String(row[idxStoreName] ?? "").trim();
    if (!storeCode && !storeName) continue;

    const boxNo = toBoxNumber(row[idxBoxNo]);
    const key = `${carNo}__${storeCode}__${storeName}`;
    const current = map.get(key);

    if (!current || boxNo > current.maxBoxNo) {
      map.set(key, { carNo, storeCode, storeName, maxBoxNo: boxNo });
    }
  }

  return [...map.values()];
}

async function parseCdcWorkbookWithMeta(file: File) {
  const rows = await parseCdcWorkbook(file);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows, deliveryDate: "" };
  }

  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }) as unknown[][];
  if (!values.length) {
    return { rows, deliveryDate: "" };
  }

  const headers = (values[0] ?? []).map((cell) => normalizeHeader(cell));
  const idxDeliveryDate = findHeaderIndex(headers, ["납품예정일"]);
  let deliveryDate = "";

  if (idxDeliveryDate >= 0) {
    for (const row of values.slice(1)) {
      deliveryDate = formatDeliveryDate(row[idxDeliveryDate]);
      if (deliveryDate) break;
    }
  }

  return { rows, deliveryDate };
}

async function parseFullBoxWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) throw new Error("완박스 파일 시트를 찾지 못했습니다.");

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }) as unknown[][];
  if (!rows.length) throw new Error("완박스 파일 데이터가 없습니다.");

  const headers = (rows[0] ?? []).map((cell) => normalizeHeader(cell));
  const idxStoreCode = findHeaderIndex(headers, ["배송거래처코드", "점포코드"]);
  const idxStoreName = findHeaderIndex(headers, ["배송거래처명", "점포명"]);
  const idxBoxNo = findHeaderIndex(headers, ["박스번호", "boxno"]);

  if (idxStoreName < 0 || idxBoxNo < 0) {
    throw new Error("완박스 파일에서 점포명, 박스번호 컬럼을 찾지 못했습니다.");
  }

  const map = new Map<string, FullBoxRow>();

  for (const row of rows.slice(1)) {
    const storeCode = idxStoreCode >= 0 ? String(row[idxStoreCode] ?? "").trim() : "";
    const storeName = String(row[idxStoreName] ?? "").trim();
    if (!storeCode && !storeName) continue;

    const boxNo = toBoxNumber(row[idxBoxNo]);
    const key = storeCode ? `code:${storeCode}` : `name:${normalizeStoreName(storeName)}`;
    const current = map.get(key);

    if (!current || boxNo > current.maxBoxNo) {
      map.set(key, { storeCode, storeName, maxBoxNo: boxNo });
    }
  }

  return [...map.values()];
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

async function fetchCdcData() {
  const token = await getAdminToken();
  const response = await fetch("/api/admin/vehicles/cdc", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshot?: CdcSnapshot | null;
    storeMapRows?: StoreMapRow[];
  };

  if (!response.ok || !payload.ok) {
    const message = sanitizeCdcMessage(payload.message || "");
    if (!message) {
      return { snapshot: null, storeMapRows: [] as StoreMapRow[] };
    }
    throw new Error(message || "CDC 데이터를 불러오지 못했습니다.");
  }

  return {
    snapshot: payload.snapshot ?? null,
    storeMapRows: Array.isArray(payload.storeMapRows) ? payload.storeMapRows : [],
  };
}

async function saveCdcSnapshot(snapshot: CdcSnapshot) {
  const token = await getAdminToken();
  const response = await fetch("/api/admin/vehicles/cdc", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshot?: CdcSnapshot;
  };
  if (!response.ok || !payload.ok || !payload.snapshot) {
    throw new Error(payload.message || "CDC 서버 저장에 실패했습니다.");
  }
  return payload.snapshot;
}

async function clearCdcSnapshot() {
  const token = await getAdminToken();
  const response = await fetch("/api/admin/vehicles/cdc", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "CDC 초기화에 실패했습니다.");
  }
}

export default function VehicleCdcPage() {
  const cdcFileInputRef = useRef<HTMLInputElement | null>(null);
  const fullBoxFileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<CdcSnapshot | null>(null);
  const [storeMapRows, setStoreMapRows] = useState<StoreMapRow[]>([]);
  const [printStartCar, setPrintStartCar] = useState("");
  const [printEndCar, setPrintEndCar] = useState("");

  const normalizedCdcRows = useMemo(
    () => (snapshot?.rows ?? []).filter((row) => String(row.storeCode ?? "").trim() || String(row.storeName ?? "").trim()),
    [snapshot]
  );

  const fullBoxMap = useMemo(() => {
    const map = new Map<string, FullBoxRow>();
    for (const row of snapshot?.fullBoxRows ?? []) {
      const codeKey = String(row.storeCode ?? "").trim();
      const nameKey = normalizeStoreName(row.storeName);
      if (codeKey) map.set(`code:${codeKey}`, row);
      if (nameKey) map.set(`name:${nameKey}`, row);
    }
    return map;
  }, [snapshot]);

  const storeMapIndex = useMemo(() => {
    const map = new Map<string, StoreMapRow>();
    for (const row of storeMapRows) {
      const codeKey = String(row.storeCode ?? "").trim();
      const nameKey = normalizeStoreName(row.storeName);
      if (codeKey) map.set(`code:${codeKey}`, row);
      if (nameKey) map.set(`name:${nameKey}`, row);
    }
    return map;
  }, [storeMapRows]);

  const cdcValueMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of normalizedCdcRows) {
      const codeKey = String(row.storeCode ?? "").trim();
      const nameKey = normalizeStoreName(row.storeName);
      if (codeKey) map.set(`code:${codeKey}`, Number(row.maxBoxNo ?? 0) || 0);
      if (nameKey) map.set(`name:${nameKey}`, Number(row.maxBoxNo ?? 0) || 0);
    }
    return map;
  }, [normalizedCdcRows]);

  const groupedCars = useMemo(() => {
    const map = new Map<string, GroupedRow[]>();
    const sourceRows = storeMapRows.length
      ? storeMapRows.filter((row) => {
          const carNo = String(row.carNo ?? "").trim();
          return Boolean(carNo) && carNo !== "9999";
        })
      : normalizedCdcRows.map((row, index) => ({
          storeCode: row.storeCode,
          storeName: row.storeName,
          carNo: row.carNo || "미지정",
          seqNo: index + 1,
        }));

    for (const row of sourceRows) {
      const storeKeyByCode = `code:${String(row.storeCode ?? "").trim()}`;
      const storeKeyByName = `name:${normalizeStoreName(row.storeName)}`;
      const cdcBoxNo = Number(cdcValueMap.get(storeKeyByCode) ?? 0) || Number(cdcValueMap.get(storeKeyByName) ?? 0) || 0;
      const fullBoxNo =
        Number(fullBoxMap.get(storeKeyByCode)?.maxBoxNo ?? 0) || Number(fullBoxMap.get(storeKeyByName)?.maxBoxNo ?? 0);
      const totalBoxNo = cdcBoxNo + fullBoxNo;
      const carNo = String(row.carNo ?? "").trim() || "미지정";
      const seqNo = Number(row.seqNo ?? 0) || 0;

      const grouped: GroupedRow = {
        carNo,
        seqNo,
        storeCode: String(row.storeCode ?? "").trim(),
        storeName: String(row.storeName ?? "").trim(),
        cdcBoxNo,
        fullBoxNo,
        totalBoxNo,
      };

      const current = map.get(carNo) ?? [];
      current.push(grouped);
      map.set(carNo, current);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ko", { numeric: true }))
      .map(([carNo, rows]) => ({
        carNo,
        rows: rows
          .sort((a, b) => {
            const seqDiff = a.seqNo - b.seqNo;
            if (seqDiff !== 0) return seqDiff;
            const codeDiff = a.storeCode.localeCompare(b.storeCode, "ko", { numeric: true });
            if (codeDiff !== 0) return codeDiff;
            return a.storeName.localeCompare(b.storeName, "ko");
          })
          .filter((row, idx, arr) => {
            const nameKey = normalizeStoreName(row.storeName);
            return arr.findIndex((r) => normalizeStoreName(r.storeName) === nameKey) === idx;
          }),
      }));
  }, [cdcValueMap, fullBoxMap, normalizedCdcRows, storeMapRows]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchCdcData();
        setSnapshot(data.snapshot);
        setStoreMapRows(data.storeMapRows);
      } catch (error) {
        setMessage(sanitizeCdcMessage((error as Error)?.message ?? ""));
      }
    })();
  }, []);

  const onPickCdcFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMessage("");

    try {
      const parsed = await parseCdcWorkbookWithMeta(file);
      const saved = await saveCdcSnapshot({
        fileName: file.name,
        fullBoxFileName: snapshot?.fullBoxFileName ?? "",
        deliveryDate: parsed.deliveryDate,
        uploadedAt: snapshot?.uploadedAt ?? "",
        uploadedBy: snapshot?.uploadedBy ?? "",
        rows: parsed.rows,
        fullBoxRows: snapshot?.fullBoxRows ?? [],
      });
      setSnapshot(saved);
      const data = await fetchCdcData();
      setStoreMapRows(data.storeMapRows);
      setMessage(`CDC 저장 완료: ${saved.rows.length}건`);
    } catch (error) {
      setMessage((error as Error)?.message ?? "CDC 파일 처리에 실패했습니다.");
    } finally {
      setBusy(false);
      if (cdcFileInputRef.current) cdcFileInputRef.current.value = "";
    }
  };

  const onPickFullBoxFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMessage("");

    try {
      const fullBoxRows = await parseFullBoxWorkbook(file);
      const saved = await saveCdcSnapshot({
        fileName: snapshot?.fileName ?? "",
        fullBoxFileName: file.name,
        deliveryDate: snapshot?.deliveryDate ?? "",
        uploadedAt: snapshot?.uploadedAt ?? "",
        uploadedBy: snapshot?.uploadedBy ?? "",
        rows: snapshot?.rows ?? [],
        fullBoxRows,
      });
      setSnapshot(saved);
      const data = await fetchCdcData();
      setStoreMapRows(data.storeMapRows);
      setMessage(`완박스 저장 완료: ${saved.fullBoxRows.length}건`);
    } catch (error) {
      setMessage((error as Error)?.message ?? "완박스 파일 처리에 실패했습니다.");
    } finally {
      setBusy(false);
      if (fullBoxFileInputRef.current) fullBoxFileInputRef.current.value = "";
    }
  };

  const onReset = async () => {
    setBusy(true);
    setMessage("");

    try {
      await clearCdcSnapshot();
      setSnapshot(null);
      setStoreMapRows([]);
      setMessage("CDC 서버 데이터를 초기화했습니다.");
    } catch (error) {
      setMessage((error as Error)?.message ?? "CDC 초기화에 실패했습니다.");
    } finally {
      setBusy(false);
      if (cdcFileInputRef.current) cdcFileInputRef.current.value = "";
      if (fullBoxFileInputRef.current) fullBoxFileInputRef.current.value = "";
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
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "11px 14px",
    borderBottom: "1px solid #eef3f7",
    color: "#113247",
    fontSize: 13,
    whiteSpace: "nowrap",
  };

  const printPages = useMemo(() => {
    const start = printStartCar.trim();
    const end = printEndCar.trim();
    if (!start && !end) return groupedCars;
    if (start && !end) {
      return groupedCars.filter((group) => group.carNo === start);
    }
    if (start && end) {
      return groupedCars.filter((group) => group.carNo.localeCompare(start, "ko", { numeric: true }) >= 0 && group.carNo.localeCompare(end, "ko", { numeric: true }) <= 0);
    }
    return groupedCars;
  }, [groupedCars, printEndCar, printStartCar]);

  const onPrint = () => {
    if (!printPages.length) return;

    const pagesHtml = printPages
      .map((page) => {
        const totalCdc = page.rows.reduce((sum, row) => sum + row.cdcBoxNo, 0);
        const totalFullBox = page.rows.reduce((sum, row) => sum + row.fullBoxNo, 0);
        const grandTotal = page.rows.reduce((sum, row) => sum + row.totalBoxNo, 0);

        const rowsHtml = page.rows
          .map(
            (row) => `
              <tr${row.fullBoxNo > 0 ? ' class="fullbox-row"' : ""}>
                <td>${escapeHtml(row.carNo)}</td>
                <td>${escapeHtml(row.seqNo || "")}</td>
                <td>${escapeHtml(row.storeCode)}</td>
                <td class="store-name">${escapeHtml(row.storeName)}</td>
                <td class="num">${escapeHtml(row.cdcBoxNo || "")}</td>
                <td class="num">${escapeHtml(row.fullBoxNo || "")}</td>
                <td class="num">${escapeHtml(row.totalBoxNo || "")}</td>
              </tr>
            `
          )
          .join("");

        return `
          <section class="page">
            <div class="page-inner">
            <div class="page-head">
              <div>
                <div class="title">CDC 박스 수량</div>
                <div class="sub">${escapeHtml(`납품예정일: ${snapshot?.deliveryDate || "-"}`)}</div>
              </div>
              <div class="summary">
                <div class="car">호차 ${escapeHtml(page.carNo)}</div>
                <div class="sumtext">CDC ${escapeHtml(totalCdc)} / 완박스 ${escapeHtml(totalFullBox)} / 합계 ${escapeHtml(grandTotal)}</div>
              </div>
            </div>
            <table class="print-table">
              <colgroup>
                <col style="width:1.6cm" />
                <col style="width:1.2cm" />
                <col style="width:1.8cm" />
                <col style="width:4.2cm" />
                <col style="width:1.2cm" />
                <col style="width:1.5cm" />
                <col style="width:1.2cm" />
              </colgroup>
              <thead>
                <tr>
                  <th>호차</th>
                  <th>순번</th>
                  <th>점포코드</th>
                  <th>점포명</th>
                  <th class="num">CDC</th>
                  <th class="num">완박스</th>
                  <th class="num">합계</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr class="total-row">
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="total-label">합계</td>
                  <td class="num total-num">${escapeHtml(totalCdc)}</td>
                  <td class="num total-num">${escapeHtml(totalFullBox)}</td>
                  <td class="num total-num">${escapeHtml(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </section>
        `;
      })
      .join("");

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc || !iframe.contentWindow) {
      iframe.remove();
      setMessage("출력 준비에 실패했습니다.");
      return;
    }

    frameDoc.open();
    frameDoc.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>CDC 출력</title>
          <style>
            @page { size: A4 landscape; margin: 10mm 30mm; }
            html, body { margin: 0; padding: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; }
            body { background: #fff; }
            .page { box-sizing: border-box; width: 100%; min-height: 190mm; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; }
            .page:last-child { page-break-after: auto; break-after: auto; }
            .page-inner { width: max-content; max-width: 100%; display: flex; flex-direction: column; justify-content: center; }
            .page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; width: 100%; margin-bottom: 16px; }
            .title { font-size: 36px; font-weight: 900; }
            .sub { margin-top: 7px; font-size: 16px; font-weight: 700; color: #475569; }
            .summary { margin-left: auto; text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
            .car { font-size: 31px; font-weight: 900; color: #0f2940; }
            .sumtext { margin-top: 7px; font-size: 16px; font-weight: 700; color: #475569; white-space: nowrap; }
            .print-table { width: auto; border-collapse: collapse; table-layout: fixed; }
            .print-table th { text-align: left; font-size: 15px; font-weight: 900; color: #26465a; border-bottom: 1px solid #e5edf3; background: #f8fbfd; white-space: nowrap; vertical-align: middle; padding: 12px 1cm 12px 0; }
            .print-table td { font-size: 15px; color: #113247; border-bottom: 1px solid #eef3f7; white-space: nowrap; vertical-align: middle; padding: 11px 1cm 11px 0; }
            .print-table th:nth-child(4), .print-table td:nth-child(4) { padding-right: 15cm; overflow: hidden; text-overflow: ellipsis; }
            .print-table th:last-child, .print-table td:last-child { padding-right: 0; }
            .num { text-align: right; font-weight: 900; }
            .store-name { overflow: hidden; text-overflow: ellipsis; }
            .fullbox-row { background: #d1d5db; }
            .total-row td { border-top: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8; background: #fff; font-weight: 900; color: #1e293b; }
            .total-label { text-align: center; }
            .total-num { font-size: 16px; }
          </style>
        </head>
        <body>${pagesHtml}</body>
      </html>
    `);
    frameDoc.close();
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 1500);
    }, 250);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <input
        ref={cdcFileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(event) => void onPickCdcFile(event.target.files?.[0] ?? null)}
      />
      <input
        ref={fullBoxFileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(event) => void onPickFullBoxFile(event.target.files?.[0] ?? null)}
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
            <div style={{ fontSize: 30, fontWeight: 950, color: "#0f2940", letterSpacing: -0.5 }}>차량 CDC</div>
            <div style={{ marginTop: 8, color: "#35546a", fontSize: 14, lineHeight: 1.6, fontWeight: 700 }}>
              출력은 점포마스터 기준 호차와 순번으로 묶습니다. 완박스가 있는 점포는 표와 출력에서 회색 음영으로 표시됩니다.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => cdcFileInputRef.current?.click()}
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
              {busy ? "처리 중..." : "CDC 파일 업로드"}
            </button>
            <button
              onClick={() => fullBoxFileInputRef.current?.click()}
              disabled={busy}
              style={{
                height: 44,
                padding: "0 18px",
                borderRadius: 14,
                border: "1px solid #7c3aed",
                background: busy ? "#ddd6fe" : "#f5f3ff",
                color: busy ? "#7c3aed" : "#5b21b6",
                fontWeight: 900,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              완박스 업로드
            </button>
            <button
              onClick={() => void onReset()}
              disabled={busy || (!snapshot?.fileName && !snapshot?.fullBoxFileName)}
              style={{
                height: 44,
                padding: "0 18px",
                borderRadius: 14,
                border: "1px solid #c7d6e3",
                background: "#fff",
                color: busy || (!snapshot?.fileName && !snapshot?.fullBoxFileName) ? "#9aa9b8" : "#113247",
                fontWeight: 900,
                cursor: busy || (!snapshot?.fileName && !snapshot?.fullBoxFileName) ? "not-allowed" : "pointer",
              }}
            >
              초기화
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, color: "#29485e", fontSize: 13, fontWeight: 700, display: "grid", gap: 4 }}>
          <div>{snapshot?.fileName ? `CDC 파일: ${snapshot.fileName}` : "CDC 파일: -"}</div>
          <div>{`납품예정일: ${snapshot?.deliveryDate || "-"}`}</div>
          <div>{snapshot?.fullBoxFileName ? `완박스 파일: ${snapshot.fullBoxFileName}` : "완박스 파일: -"}</div>
        </div>
        {message ? <div style={{ marginTop: 8, color: "#103b53", fontSize: 13, fontWeight: 700 }}>{message}</div> : null}
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#103b53" }}>호차별 점포 박스 수량</div>
            <div style={{ marginTop: 6, color: "#5a7385", fontSize: 13, fontWeight: 700 }}>
              컬럼은 `호차 / 순번 / 점포코드 / 점포명 / CDC / 완박스 / 합계` 기준으로 표시됩니다.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", marginLeft: "auto" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={printStartCar}
                onChange={(event) => setPrintStartCar(event.target.value)}
                placeholder="시작 호차"
                style={{
                  width: 110,
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #c7d6e3",
                  padding: "0 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#103b53",
                  background: "#fff",
                }}
              />
              <span style={{ color: "#6b7f90", fontWeight: 800 }}>~</span>
              <input
                value={printEndCar}
                onChange={(event) => setPrintEndCar(event.target.value)}
                placeholder="끝 호차"
                style={{
                  width: 110,
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #c7d6e3",
                  padding: "0 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#103b53",
                  background: "#fff",
                }}
              />
            </div>
            <button
              onClick={onPrint}
              disabled={busy || printPages.length === 0}
              style={{
                height: 44,
                minWidth: 112,
                padding: "0 20px",
                borderRadius: 14,
                border: "1px solid #103b53",
                background: "#fff",
                color: busy || printPages.length === 0 ? "#9aa9b8" : "#103b53",
                fontWeight: 900,
                cursor: busy || printPages.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              CDC 출력
            </button>
          </div>
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>호차</th>
                <th style={thStyle}>순번</th>
                <th style={thStyle}>점포코드</th>
                <th style={thStyle}>점포명</th>
                <th style={thStyle}>CDC</th>
                <th style={thStyle}>완박스</th>
                <th style={thStyle}>합계</th>
              </tr>
            </thead>
            <tbody>
              {groupedCars.flatMap((group) => group.rows).map((row) => (
                <tr key={`${row.carNo}-${row.seqNo}-${row.storeCode}-${row.storeName}`} style={row.fullBoxNo > 0 ? { background: "#f3f4f6" } : undefined}>
                  <td style={tdStyle}>{row.carNo}</td>
                  <td style={tdStyle}>{row.seqNo || ""}</td>
                  <td style={tdStyle}>{row.storeCode}</td>
                  <td style={{ ...tdStyle, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}>{row.storeName}</td>
                  <td style={tdStyle}>{row.cdcBoxNo || ""}</td>
                  <td style={tdStyle}>{row.fullBoxNo || ""}</td>
                  <td style={{ ...tdStyle, fontWeight: 900 }}>{row.totalBoxNo || ""}</td>
                </tr>
              ))}
              {groupedCars.length === 0 ? (
                <tr>
                  <td colSpan={7} style={tdStyle}>CDC 파일을 업로드하시면 여기서 바로 확인할 수 있습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
