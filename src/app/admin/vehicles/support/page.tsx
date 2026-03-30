"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import { supabase } from "@/lib/supabase";

type CargoRow = {
  id: string;
  support_excluded?: boolean;
  note?: string;
  car_no: string;
  seq_no: number;
  store_code: string;
  store_name: string;
  large_box: number;
  large_inner: number;
  large_other: number;
  large_day2l: number;
  large_nb2l: number;
  small_low: number;
  small_high: number;
  event: number;
  tobacco: number;
  certificate: number;
  cdc: number;
  pbox: number;
  standard_time: string;
  address: string;
};

type DriverProfile = {
  name: string;
  phone: string;
  car_no: string;
  vehicle_type: string;
  carrier: string;
  garage: string;
  vehicle_number: string;
};

// ── IndexedDB ────────────────────────────────────────────
const VEHICLE_DB_NAME = "han-admin-vehicles";
const VEHICLE_STORE_NAME = "vehicle-page";
const VEHICLE_STORE_KEY = "current";

function openVehicleDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(VEHICLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VEHICLE_STORE_NAME)) db.createObjectStore(VEHICLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type SubtotalSetting = { support_excluded: boolean; note: string };
type SnapshotResult = { cargoRows: CargoRow[]; deliveryDate: string; fileName?: string; subtotalSettings: Record<string, SubtotalSetting> };

async function readLocalSnapshot(): Promise<SnapshotResult | null> {
  try {
    const db = await openVehicleDb();
    const data = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const tx = db.transaction(VEHICLE_STORE_NAME, "readonly");
      const store = tx.objectStore(VEHICLE_STORE_NAME);
      const req = store.get(VEHICLE_STORE_KEY);
      req.onsuccess = () => { resolve((req.result as Record<string, unknown>) ?? null); db.close(); };
      req.onerror = () => { reject(req.error); db.close(); };
    });
    if (!data) return null;
    const cargoRows = Array.isArray(data.cargoRows)
      ? (data.cargoRows as CargoRow[]).filter((r) => !r.id?.startsWith("subtotal-"))
      : [];
    const productRows = Array.isArray(data.productRows) ? (data.productRows as Array<{ delivery_date?: string }>) : [];
    const deliveryDate = productRows.find((r) => r.delivery_date)?.delivery_date ?? "";
    const subtotalSettings = (data.subtotalSettings ?? {}) as Record<string, SubtotalSetting>;
    return { cargoRows, deliveryDate, fileName: data.fileName as string | undefined, subtotalSettings };
  } catch {
    return null;
  }
}

// ── Utils ────────────────────────────────────────────────
function toText(v: unknown) { return String(v ?? "").replace(/\r/g, " ").replace(/\n/g, " ").trim(); }
function formatNumber(v: number) { return new Intl.NumberFormat("ko-KR").format(v); }
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}
function normalizeCarNo(v: unknown) { return toText(v).replace(/\s+/g, ""); }
function cargoTotals(row: CargoRow) {
  return {
    largeTotal: row.large_box + row.large_inner + row.large_other + row.large_day2l + row.large_nb2l,
    smallTotal: row.small_low + row.small_high,
  };
}
function formatDisplayDate(value: string) {
  if (!value) return "";
  const m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const normalized = m ? `${m[1]}-${m[2]}-${m[3]}` : value;
  const date = new Date(`${normalized}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}년 ${String(date.getMonth()+1).padStart(2,"0")}월 ${String(date.getDate()).padStart(2,"0")}일`;
}

// ── API ──────────────────────────────────────────────────
async function getToken() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;
  await new Promise((r) => setTimeout(r, 300));
  const { data: d2 } = await supabase.auth.getSession();
  return d2.session?.access_token ?? null;
}

async function fetchServerSnapshot(): Promise<SnapshotResult | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    // 서명된 URL만 받아서 Supabase CDN에서 직접 다운로드 (서버 재전달 없음)
    const res = await fetch("/api/admin/vehicles/current", {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean; snapshotUrl?: string;
      snapshot?: { fileName?: string; productRows?: Array<{ delivery_date?: string }>; cargoRows?: CargoRow[]; subtotalSettings?: Record<string, SubtotalSetting> } | null;
    };
    if (!res.ok || !payload?.ok) return null;
    let snapshot = payload.snapshot ?? null;
    if (!snapshot && payload.snapshotUrl) {
      snapshot = await fetch(payload.snapshotUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    }
    if (!snapshot) return null;
    const cargoRows: CargoRow[] = Array.isArray(snapshot.cargoRows)
      ? (snapshot.cargoRows as CargoRow[]).filter((r) => !r.id?.startsWith("subtotal-"))
      : [];
    const deliveryDate = (snapshot.productRows ?? []).find((r) => r.delivery_date)?.delivery_date ?? "";
    const subtotalSettings = (snapshot.subtotalSettings ?? {}) as Record<string, SubtotalSetting>;
    return { cargoRows, deliveryDate, fileName: snapshot.fileName, subtotalSettings };
  } catch { return null; }
}

async function fetchDriverIndex(carNos: string[]): Promise<Map<string, DriverProfile>> {
  const normalized = [...new Set(carNos.map(normalizeCarNo).filter(Boolean))];
  if (!normalized.length) return new Map();
  const { data, error } = await supabase
    .from("profiles").select("name,phone,car_no,vehicle_type,carrier,garage,vehicle_number")
    .ilike("work_part", "%기사%").or(normalized.map((n) => `car_no.ilike.%${n}%`).join(","));
  if (error) return new Map();
  const index = new Map<string, DriverProfile>();
  for (const row of data ?? []) {
    const tokens = normalizeCarNo((row as Record<string,unknown>).car_no).split(/[\/,|]/).map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      if (!normalized.includes(token) || index.has(token)) continue;
      index.set(token, { name: toText((row as Record<string,unknown>).name), phone: toText((row as Record<string,unknown>).phone), car_no: token, vehicle_type: toText((row as Record<string,unknown>).vehicle_type), carrier: toText((row as Record<string,unknown>).carrier), garage: toText((row as Record<string,unknown>).garage), vehicle_number: toText((row as Record<string,unknown>).vehicle_number) });
    }
  }
  return index;
}

async function fetchContactIndex(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("store_contacts").select("store_name,phone");
  if (error) return new Map();
  const index = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.store_name && row.phone && !index.has(row.store_name)) index.set(row.store_name, String(row.phone));
  }
  return index;
}

// ── 선작업/이동점포 공지 카드 ───────────────
function StoreNoticeCardMulti({
  rows,
  noticeMap,
  reportDate,
  cardRef,
}: {
  rows: CargoRow[];
  noticeMap: Record<string, string>;
  reportDate: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  // 호차·순번 오름차순 정렬
  const activeRows = rows
    .filter((r) => noticeMap[r.id]?.trim())
    .sort((a, b) => {
      const carA = normalizeCarNo(a.car_no).localeCompare(normalizeCarNo(b.car_no), "ko", { numeric: true });
      if (carA !== 0) return carA;
      return (a.seq_no ?? 0) - (b.seq_no ?? 0);
    });
  if (!activeRows.length) return null;

  // 동일 공지 내용끼리 묶기 (첫 등장 순서 유지 = 정렬 후 첫 번째 행 기준)
  const groups: { noticeText: string; rows: CargoRow[] }[] = [];
  const noticeIndexMap = new Map<string, number>();
  for (const row of activeRows) {
    const text = noticeMap[row.id]?.trim() ?? "";
    if (noticeIndexMap.has(text)) {
      groups[noticeIndexMap.get(text)!].rows.push(row);
    } else {
      noticeIndexMap.set(text, groups.length);
      groups.push({ noticeText: text, rows: [row] });
    }
  }

  const BORDER = "1px solid #cbd5e1";
  const GROUP_COLORS = ["#f0f9ff", "#f0fdf4", "#fefce8", "#fdf4ff", "#fff7ed"];

  return (
    <div
      ref={cardRef}
      style={{
        width: "max-content",
        minWidth: 480,
        background: "#fff",
        padding: "20px 22px",
        fontFamily: "Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* 타이틀 */}
      <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "2px solid #0ea5e9", display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 950, color: "#0c4a6e", letterSpacing: -0.3 }}>선작업 / 이동점포 공지</div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{reportDate} · {activeRows.length}개 점포</div>
      </div>

      {/* 테이블 */}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#0ea5e9" }}>
            {["호차", "순번", "점포명", "공지사항"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#fff",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  border: BORDER,
                  letterSpacing: 0.3,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gi) => {
            const rowBg = GROUP_COLORS[gi % GROUP_COLORS.length];
            return group.rows.map((row, ri) => (
              <tr key={row.id}>
                <td style={{ padding: "7px 14px", fontSize: 13, fontWeight: 900, color: "#1e3a5f", whiteSpace: "nowrap", background: rowBg, border: BORDER }}>
                  {normalizeCarNo(row.car_no)}호차
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, fontWeight: 900, color: "#1e3a5f", whiteSpace: "nowrap", textAlign: "center", background: rowBg, border: BORDER }}>
                  {row.seq_no}번
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, fontWeight: 900, color: "#111827", whiteSpace: "nowrap", background: rowBg, border: BORDER }}>
                  {row.store_name}
                </td>
                {/* 공지사항: 그룹 첫 행에만 rowspan */}
                {ri === 0 && (
                  <td
                    rowSpan={group.rows.length}
                    style={{
                      padding: "10px 16px",
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#9a3412",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.65,
                      background: "#fff7ed",
                      border: BORDER,
                      borderLeft: "3px solid #f97316",
                      verticalAlign: "middle",
                      minWidth: 160,
                    }}
                  >
                    {group.noticeText}
                  </td>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 과물량 호차별 복사 카드 ───────────────────────────────────
function OverQuantityCarCard({
  row,
  reportDate,
  cardRef,
  extraNumber,
}: {
  row: CargoRow;
  reportDate: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
  extraNumber?: string;
}) {
  const { largeTotal, smallTotal } = cargoTotals(row);
  const carNo = normalizeCarNo(row.car_no);
  const extra = extraNumber ? Number(extraNumber) : 0;
  const f = (label: string, v: number) =>
    v > 0 ? (
      <div key={label} style={{ fontSize: 11, color: "#374151", display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#111827" }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{formatNumber(v)}</span>
      </div>
    ) : null;
  return (
    <div
      ref={cardRef}
      style={{
        width: "max-content",
        minWidth: 260,
        background: "#fff",
        padding: "18px 22px",
        fontFamily: "Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* 헤더 */}
      <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid #dc2626", display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 950, color: "#991b1b", letterSpacing: -0.3 }}>과물량 처리</div>
        {reportDate && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{reportDate}</div>}
      </div>
      {/* 호차 + 추가수량 */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 950, color: "#0f2940" }}>{carNo}호차</span>
        {extra !== 0 && (
          <span style={{ fontSize: 16, fontWeight: 900, color: "#dc2626" }}>+{formatNumber(extra)} <span style={{ fontSize: 11, fontWeight: 700 }}>추가금액</span></span>
        )}
      </div>
      {/* 대분 */}
      <div style={{ background: "#f0f4f8", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #bae6fd", marginBottom: 4, paddingBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 950, color: "#0369a1" }}>대분</span>
          <span style={{ fontSize: 14, fontWeight: 950, color: "#0369a1" }}>{formatNumber(largeTotal)}</span>
        </div>
        <div style={{ paddingLeft: 4, display: "flex", flexDirection: "column", gap: 1 }}>
          {f("박스존", row.large_box)}
          {f("이너존", row.large_inner)}
          {f("기타", row.large_other)}
          {f("올데이2L", row.large_day2l)}
          {f("노브랜드2L", row.large_nb2l)}
        </div>
      </div>
      {/* 소분 */}
      <div style={{ background: "#f0fdf4", borderRadius: 6, padding: "8px 10px", marginBottom: (row.event > 0 || row.tobacco > 0 || row.certificate > 0 || row.cdc > 0) ? 8 : 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #bbf7d0", marginBottom: 4, paddingBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 950, color: "#166534" }}>소분</span>
          <span style={{ fontSize: 14, fontWeight: 950, color: "#166534" }}>{formatNumber(smallTotal)}</span>
        </div>
        <div style={{ paddingLeft: 4, display: "flex", flexDirection: "column", gap: 1 }}>
          {f("경량존", row.small_low)}
          {f("슬라존", row.small_high)}
        </div>
      </div>
      {/* 기타 */}
      {(row.event > 0 || row.tobacco > 0 || row.certificate > 0 || row.cdc > 0) && (
        <div style={{ background: "#fefce8", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
          {f("행사", row.event)}
          {f("담배", row.tobacco)}
          {f("유가증권", row.certificate)}
          {f("CDC", row.cdc)}
        </div>
      )}
    </div>
  );
}

// ── 운송게시판용 카드 (호차/순번/점포명/지원기사) ───────────────
function SupportBoardCard({
  rows,
  reportDate,
  cardRef,
}: {
  rows: CargoRow[];
  reportDate: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!rows.length) return null;

  // 부분합 가상행 제외 (id가 subtotal- 로 시작하는 행)
  const actualRows = rows.filter((r) => !r.id.startsWith("subtotal-"));

  // 호차·순번 오름차순 전체 정렬 후, 연속된 같은 기사끼리 그룹
  const sorted = [...actualRows].sort((a, b) => {
    const c = normalizeCarNo(a.car_no).localeCompare(normalizeCarNo(b.car_no), "ko", { numeric: true });
    return c !== 0 ? c : (a.seq_no ?? 0) - (b.seq_no ?? 0);
  });
  const groups: { driver: string; rows: CargoRow[] }[] = [];
  for (const row of sorted) {
    const driver = row.note?.trim() || "";
    const last = groups[groups.length - 1];
    if (last && last.driver === driver) {
      last.rows.push(row);
    } else {
      groups.push({ driver, rows: [row] });
    }
  }

  const BORDER = "1px solid #cbd5e1";
  const GROUP_COLORS = ["#f0f9ff", "#f0fdf4", "#fefce8", "#fdf4ff", "#fff7ed"];

  return (
    <div
      ref={cardRef}
      style={{
        width: "max-content",
        minWidth: 480,
        background: "#fff",
        padding: "20px 22px",
        fontFamily: "Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* 타이틀 */}
      <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "2px solid #7c3aed", display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 950, color: "#4c1d95", letterSpacing: -0.3 }}>지원 배송 현황</div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{reportDate} · {rows.length}개 점포</div>
      </div>

      {/* 테이블 */}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#7c3aed" }}>
            {["호차", "순번", "점포명", "지원기사"].map((h) => (
              <th key={h} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 900, color: "#fff", textAlign: "left", whiteSpace: "nowrap", border: BORDER, letterSpacing: 0.3 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gi) => {
            const bg = GROUP_COLORS[gi % GROUP_COLORS.length];
            const driver = group.driver || "-";
            return group.rows.map((row, ri) => (
              <tr key={row.id}>
                <td style={{ padding: "7px 14px", fontSize: 13, fontWeight: 900, color: "#1e3a5f", whiteSpace: "nowrap", background: bg, border: BORDER }}>
                  {normalizeCarNo(row.car_no)}호차
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, fontWeight: 900, color: "#1e3a5f", whiteSpace: "nowrap", textAlign: "center", background: bg, border: BORDER }}>
                  {row.seq_no}번
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, fontWeight: 900, color: "#111827", whiteSpace: "nowrap", background: bg, border: BORDER }}>
                  {row.store_name}
                </td>
                {/* 지원기사: 그룹 첫 행에만 rowspan */}
                {ri === 0 && (
                  <td
                    rowSpan={group.rows.length}
                    style={{
                      padding: "7px 16px",
                      fontSize: 13,
                      fontWeight: 900,
                      color: driver === "-" ? "#9ca3af" : "#111827",
                      whiteSpace: "nowrap",
                      background: bg,
                      border: BORDER,
                      verticalAlign: "middle",
                      textAlign: "center",
                    }}
                  >
                    {driver}
                  </td>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 기사 메시지 카드 (회전별 가로 레이아웃) ──────────────
function DriverMessageCardHorizontal({
  rows,
  driverName,
  reportDate,
  contactIndex,
  driverIndex,
  roundMap,
  cardRef,
}: {
  rows: CargoRow[];
  driverName: string;
  reportDate: string;
  contactIndex: Map<string, string>;
  driverIndex: Map<string, DriverProfile>;
  roundMap: Record<string, string>;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const roundGroups = useMemo(() => {
    const groups = new Map<string, CargoRow[]>();
    for (const row of rows) {
      // 2개 이상일 때 미입력은 1회전으로 처리, 1개일 때는 그룹 무시
      const r = rows.length === 1 ? "single" : (roundMap[row.id]?.trim() || "1");
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(row);
    }
    return [...groups.entries()].sort((a, b) => {
      if (a[0] === "single") return 0;
      return Number(a[0]) - Number(b[0]);
    });
  }, [rows, roundMap]);

  const f = (label: string, value: number | string) => {
    if (value === 0 || value === "") return null;
    return (
      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid #e5eaf0" }}>
        <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#111827" }}>{typeof value === "number" ? formatNumber(value) : value}</span>
      </div>
    );
  };

  const StoreCol = ({ row }: { row: CargoRow }) => {
    const { largeTotal, smallTotal } = cargoTotals(row);
    const storePhone = contactIndex.get(row.store_name) ?? "";
    const origDriver = driverIndex.get(normalizeCarNo(row.car_no));
    return (
      <div style={{ minWidth: 200, flexShrink: 0, background: "rgba(255,255,255,0.85)", borderRadius: 10, padding: "10px 12px" }}>
        {/* 점포명 */}
        <div style={{ fontSize: 14, fontWeight: 950, color: "#0f2940", marginBottom: 4, letterSpacing: -0.3 }}>{row.store_name}</div>
        {/* 기본 메타 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: "#6b7280" }}>호차 <strong style={{ color: "#0f2940" }}>{normalizeCarNo(row.car_no)}</strong></span>
          {row.seq_no > 0 && <span style={{ color: "#6b7280" }}>순번 <strong style={{ color: "#0f2940" }}>{row.seq_no}</strong></span>}
          {row.store_code && <span style={{ color: "#6b7280" }}>점포코드 <strong style={{ color: "#0f2940" }}>{row.store_code}</strong></span>}
        </div>
        {/* 기존기사 */}
        {origDriver && (
          <div style={{ background: "#fef9ec", borderRadius: 6, padding: "4px 8px", marginBottom: 6, fontSize: 10, fontWeight: 700 }}>
            <span style={{ color: "#92400e" }}>본기사 </span>
            <strong style={{ color: "#78350f" }}>{origDriver.name}</strong>
            {origDriver.phone && <span style={{ color: "#92400e" }}> · {formatPhone(origDriver.phone)}</span>}
          </div>
        )}
        {/* 기준시간·주소·점포연락처 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
          {row.standard_time && (
            <div style={{ fontSize: 11 }}>
              <span style={{ color: "#6b7280", fontWeight: 700 }}>기준시간 </span>
              <strong style={{ color: "#111827" }}>{row.standard_time}</strong>
            </div>
          )}
          {row.address && (
            <div style={{ fontSize: 10, color: "#374151", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: 700, color: "#6b7280" }}>주소 </span>{row.address}
            </div>
          )}
          {storePhone && (
            <div style={{ fontSize: 11 }}>
              <span style={{ color: "#6b7280", fontWeight: 700 }}>점포연락처 </span>
              <strong style={{ color: "#111827" }}>{formatPhone(storePhone)}</strong>
            </div>
          )}
        </div>
        {/* 물동량 */}
        <div style={{ background: "#f0f4f8", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "2px solid #bae6fd", marginBottom: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 950, color: "#0369a1" }}>대분</span>
            <span style={{ fontSize: 13, fontWeight: 950, color: "#0369a1" }}>{formatNumber(largeTotal)}</span>
          </div>
          <div style={{ paddingLeft: 4, marginBottom: 4 }}>
            {f("박스존", row.large_box)}{f("이너존", row.large_inner)}{f("기타", row.large_other)}{f("올데이2L", row.large_day2l)}{f("노브랜드2L", row.large_nb2l)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "2px solid #bbf7d0", marginBottom: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 950, color: "#166534" }}>소분</span>
            <span style={{ fontSize: 13, fontWeight: 950, color: "#166534" }}>{formatNumber(smallTotal)}</span>
          </div>
          <div style={{ paddingLeft: 4, marginBottom: 4 }}>
            {f("경량존", row.small_low)}{f("슬라존", row.small_high)}
          </div>
          {(row.event > 0 || row.tobacco > 0 || row.certificate > 0 || row.cdc > 0) && (
            <div style={{ paddingLeft: 4 }}>
              {f("행사", row.event)}{f("담배", row.tobacco)}{f("유가증권", row.certificate)}{f("CDC", row.cdc)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={cardRef} style={{ width: "max-content", minWidth: 500, background: "#fff", borderRadius: 0, padding: "20px 24px", fontFamily: "Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif", boxSizing: "border-box" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #f0f4f8", paddingBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🚗</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0f2940" }}>{driverName ? `${driverName} 기사님` : "지원기사"} 배송 안내</div>
          <div style={{ fontSize: 11, color: "#5a7385", fontWeight: 700 }}>{reportDate} · 총 {rows.length}개 점포</div>
        </div>
      </div>

      {/* 회전별 행 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {roundGroups.map(([roundKey, roundRows]) => {
          const isSingle = roundKey === "single";
          const bgColor = isSingle ? "#f8fafc" : `hsl(${(Number(roundKey) - 1) * 60 % 360}, 60%, 95%)`;
          // 회전 합계
          const roundLargeTotal = roundRows.reduce((s, r) => s + cargoTotals(r).largeTotal, 0);
          const roundSmallTotal = roundRows.reduce((s, r) => s + cargoTotals(r).smallTotal, 0);
          return (
            <div key={roundKey} style={{ background: bgColor, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              {/* 회전 라벨 + 합계 (1개 점포일 때는 숨김) */}
              {!isSingle && (
                <div style={{ width: 70, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 950, color: "#0f2940", lineHeight: 1 }}>{roundKey}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#5a7385" }}>회전</div>
                  <div style={{ marginTop: 6, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#0369a1", fontWeight: 700 }}>대분 합계</div>
                    <div style={{ fontSize: 14, fontWeight: 950, color: "#0369a1" }}>{formatNumber(roundLargeTotal)}</div>
                    <div style={{ fontSize: 10, color: "#166534", fontWeight: 700, marginTop: 4 }}>소분 합계</div>
                    <div style={{ fontSize: 14, fontWeight: 950, color: "#166534" }}>{formatNumber(roundSmallTotal)}</div>
                  </div>
                </div>
              )}
              {/* 점포 컬럼들 */}
              <div style={{ display: "flex", gap: 10, flexWrap: "nowrap" }}>
                {roundRows.map((row) => <StoreCol key={row.id} row={row} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
export default function SupportPage() {
  const [cargoRows, setCargoRows] = useState<CargoRow[]>([]);
  const [subtotalSettings, setSubtotalSettings] = useState<Record<string, SubtotalSetting>>({});
  const [deliveryDate, setDeliveryDate] = useState("");
  const [driverIndex, setDriverIndex] = useState<Map<string, DriverProfile>>(new Map());
  const [contactIndex, setContactIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<Record<string, "copying" | "done" | "error">>({});
  const [roundInputs, setRoundInputs] = useState<Record<string, string>>({});
  const [noticeInputs, setNoticeInputs] = useState<Record<string, string>>({});
  const EXTRA_STORAGE_KEY = "han-admin-ovq-extra";
  const [extraNumbers, setExtraNumbers] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(EXTRA_STORAGE_KEY) ?? "{}"); } catch { return {}; }
  });

  const updateExtraNumber = (carNo: string, value: string) => {
    setExtraNumbers((prev) => {
      const next = { ...prev, [carNo]: value };
      try { localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // collapsed[key] === false → 펼침, undefined/true → 접힘 (기본값 접힘)
  const toggleCollapse = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: prev[key] === false }));

  const noticeCardRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());
  const driverCardRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());
  const lastSyncAtRef = useRef<number>(0);

  function getNoticeRef(key: string) {
    if (!noticeCardRefs.current.has(key)) noticeCardRefs.current.set(key, React.createRef<HTMLDivElement>());
    return noticeCardRefs.current.get(key)!;
  }
  function getDriverGroupRef(key: string) {
    if (!driverCardRefs.current.has(key)) driverCardRefs.current.set(key, React.createRef<HTMLDivElement>());
    return driverCardRefs.current.get(key)!;
  }

  const supportRows = useMemo(() => cargoRows.filter((r) => r.support_excluded), [cargoRows]);
  // 부분합 체크된 호차의 행은 과물량 섹션에만 표시 — 기사별 그룹에서 제외
  const regularSupportRows = useMemo(
    () => supportRows.filter((r) => !r.id.startsWith("subtotal-") && !subtotalSettings[normalizeCarNo(r.car_no)]?.support_excluded),
    [supportRows, subtotalSettings]
  );

  // 부분합 체크된 호차 — subtotalSettings 기준, cargoRows에서 합계 계산 (상세 포함)
  const subtotalSupportRows = useMemo(() => {
    return Object.entries(subtotalSettings)
      .filter(([, s]) => s.support_excluded)
      .map(([carNo]) => {
        const rows = cargoRows.filter(
          (r) => normalizeCarNo(r.car_no) === normalizeCarNo(carNo) && !r.id.startsWith("subtotal-")
        );
        return {
          carNo,
          largeTotal: rows.reduce((sum, r) => sum + cargoTotals(r).largeTotal, 0),
          smallTotal: rows.reduce((sum, r) => sum + cargoTotals(r).smallTotal, 0),
          large_box: rows.reduce((sum, r) => sum + r.large_box, 0),
          large_inner: rows.reduce((sum, r) => sum + r.large_inner, 0),
          large_other: rows.reduce((sum, r) => sum + r.large_other, 0),
          large_day2l: rows.reduce((sum, r) => sum + r.large_day2l, 0),
          large_nb2l: rows.reduce((sum, r) => sum + r.large_nb2l, 0),
          small_low: rows.reduce((sum, r) => sum + r.small_low, 0),
          small_high: rows.reduce((sum, r) => sum + r.small_high, 0),
          event: rows.reduce((sum, r) => sum + r.event, 0),
          tobacco: rows.reduce((sum, r) => sum + r.tobacco, 0),
          certificate: rows.reduce((sum, r) => sum + r.certificate, 0),
          cdc: rows.reduce((sum, r) => sum + r.cdc, 0),
        };
      })
      .sort((a, b) => normalizeCarNo(a.carNo).localeCompare(normalizeCarNo(b.carNo), "ko", { numeric: true }));
  }, [subtotalSettings, cargoRows]);

  const groupedByDriver = useMemo(() => {
    const groups = new Map<string, CargoRow[]>();
    for (const row of regularSupportRows) {
      const key = row.note?.trim() ?? "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return [...groups.entries()].sort((a, b) => {
      if (!a[0] && b[0]) return 1;
      if (a[0] && !b[0]) return -1;
      return a[0].localeCompare(b[0], "ko");
    });
  }, [regularSupportRows]);

  const reportDate = useMemo(() => formatDisplayDate(deliveryDate), [deliveryDate]);

  async function loadIndexes(rows: CargoRow[]) {
    const carNos = [...new Set(rows.filter((r) => r.support_excluded).map((r) => normalizeCarNo(r.car_no)))];
    const [drivers, contacts] = await Promise.all([fetchDriverIndex(carNos), fetchContactIndex()]);
    setDriverIndex(drivers);
    setContactIndex(contacts);
  }

  async function loadRounds(rows: CargoRow[]) {
    const ids = rows.filter((r) => r.support_excluded).map((r) => r.id);
    if (!ids.length) return;
    const { data } = await supabase.from("support_rounds").select("row_id,round_no").in("row_id", ids);
    if (!data?.length) return;
    const map: Record<string, string> = {};
    for (const d of data) map[d.row_id] = d.round_no ?? "";
    setRoundInputs(map);
  }

  async function saveRound(rowId: string, roundNo: string) {
    await supabase.from("support_rounds").upsert({ row_id: rowId, round_no: roundNo, updated_at: new Date().toISOString() }, { onConflict: "row_id" });
  }

  async function loadNotices(rows: CargoRow[]) {
    const ids = rows.filter((r) => r.support_excluded).map((r) => r.id);
    if (!ids.length) return;
    const { data } = await supabase.from("support_notices").select("row_id,notice").in("row_id", ids);
    if (!data?.length) return;
    const map: Record<string, string> = {};
    for (const d of data) map[d.row_id] = d.notice ?? "";
    setNoticeInputs(map);
  }

  async function saveNotice(rowId: string, notice: string) {
    await supabase.from("support_notices").upsert({ row_id: rowId, notice, updated_at: new Date().toISOString() }, { onConflict: "row_id" });
  }

  // fallbackSubtotal: 서버 스냅샷에 subtotalSettings가 없을 때 IndexedDB 값으로 대체
  function applySnapshot(s: SnapshotResult, fallbackSubtotal?: Record<string, SubtotalSetting>) {
    setCargoRows(s.cargoRows);
    setDeliveryDate(s.deliveryDate);
    const hasSub = Object.keys(s.subtotalSettings).length > 0;
    setSubtotalSettings(hasSub ? s.subtotalSettings : (fallbackSubtotal ?? s.subtotalSettings));
    void loadIndexes(s.cargoRows);
    void loadRounds(s.cargoRows);
    void loadNotices(s.cargoRows);
  }

  useEffect(() => {
    void (async () => {
      const local = await readLocalSnapshot();
      if (local) {
        applySnapshot(local);
        setLoading(false);
        setRefreshing(true);
        const server = await fetchServerSnapshot();
        setRefreshing(false);
        lastSyncAtRef.current = Date.now();
        if (server) applySnapshot(server, local.subtotalSettings);
        return;
      }
      try {
        const server = await fetchServerSnapshot();
        if (!server) throw new Error("서버 저장 데이터를 불러오지 못했습니다.");
        applySnapshot(server);
      } catch (e) {
        setError((e as Error)?.message ?? "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      const local = await readLocalSnapshot();
      if (local) applySnapshot(local);
      const server = await fetchServerSnapshot();
      if (server) applySnapshot(server, local?.subtotalSettings);
      else if (!local) { setCargoRows([]); setDeliveryDate(""); setSubtotalSettings({}); }
    } finally {
      setRefreshing(false);
      lastSyncAtRef.current = Date.now();
    }
  };

  useEffect(() => {
    const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5분
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncAtRef.current < SYNC_COOLDOWN_MS) return;
      void manualRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyImage = async (key: string, ref: React.RefObject<HTMLDivElement | null>) => {
    const el = ref.current;
    if (!el) return;
    setCopyStatus((s) => ({ ...s, [key]: "copying" }));
    try {
      const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyStatus((s) => ({ ...s, [key]: "done" }));
      setTimeout(() => setCopyStatus((s) => { const n = { ...s }; delete n[key]; return n; }), 2500);
    } catch {
      setCopyStatus((s) => ({ ...s, [key]: "error" }));
      setTimeout(() => setCopyStatus((s) => { const n = { ...s }; delete n[key]; return n; }), 2500);
    }
  };

  const copyBtnLabel = (key: string, def: string) => {
    if (copyStatus[key] === "copying") return "복사 중...";
    if (copyStatus[key] === "done") return "복사됨 ✓";
    if (copyStatus[key] === "error") return "복사 실패 ✕";
    return def;
  };

  const btnBase: React.CSSProperties = { padding: "7px 14px", borderRadius: 4, fontWeight: 900, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", border: "none" };

  if (loading) return <div style={{ padding: 24, color: "#6b7280", fontWeight: 800 }}>데이터 불러오는 중...</div>;
  if (error) return <div style={{ padding: 24, color: "#b91c1c", fontWeight: 800 }}>{error}</div>;

  return (
    <div style={{ fontFamily: "Pretendard, system-ui, sans-serif" }}>
      <style>{`.ovq-extra-input::placeholder { color: #9ca3af; opacity: 1; }`}</style>
      {/* 헤더 */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 950, color: "#0f2940", letterSpacing: -0.5 }}>지원 물동량</div>
          {reportDate && <div style={{ fontSize: 14, color: "#5a7385", fontWeight: 700, marginTop: 6 }}>{reportDate}</div>}
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 700, marginTop: 6 }}>
            지원 체크 점포 <strong style={{ color: "#0f2940" }}>{regularSupportRows.length}개</strong>
            {groupedByDriver.length > 0 && <span style={{ color: "#6b7280" }}> · {groupedByDriver.length}명 기사</span>}
            {subtotalSupportRows.length > 0 && <span style={{ color: "#dc2626" }}> · 과물량 {subtotalSupportRows.length}호차</span>}

            {refreshing && <span style={{ color: "#0369a1", marginLeft: 10, fontSize: 12 }}>서버 동기화 중...</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/admin/vehicles/report?supportAuto=1"
            style={{ ...btnBase, background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "#fff", border: "1px solid #0e7490", textDecoration: "none" }}>
            지원(자동) 운행일보 →
          </Link>
          <button
            onClick={() => {
              const allKeys = ["__ovq__", ...groupedByDriver.map(([d]) => `driver-${d || "_unassigned"}`)];
              const allCollapsed = allKeys.every((k) => collapsed[k] !== false);
              const next: Record<string, boolean> = {};
              for (const k of allKeys) next[k] = allCollapsed ? false : true;
              setCollapsed(next);
            }}
            style={{ ...btnBase, background: "#f1f5f9", color: "#374151", border: "1px solid #cbd5e1" }}
          >
            {["__ovq__", ...groupedByDriver.map(([d]) => `driver-${d || "_unassigned"}`)].every((k) => collapsed[k] !== false) ? "▶ 모두 펴기" : "▼ 모두 접기"}
          </button>
          <button onClick={manualRefresh} disabled={refreshing} style={{ ...btnBase, background: refreshing ? "#e2e8f0" : "#f1f5f9", color: "#374151", border: "1px solid #cbd5e1", cursor: refreshing ? "not-allowed" : "pointer" }}>
            {refreshing ? "동기화 중..." : "새로고침"}
          </button>
        </div>
      </div>

      {supportRows.length === 0 && subtotalSupportRows.length === 0 && (
        <div style={{ border: "1px solid #d6e4ee", background: "#fff", padding: "32px 24px", color: "#6b7280", fontWeight: 700, fontSize: 15, textAlign: "center" }}>
          지원 체크된 점포가 없습니다.
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <Link href="/admin/vehicles" style={{ color: "#0f766e", textDecoration: "none", fontWeight: 800 }}>물동량 페이지에서 지원 체크 →</Link>
          </div>
        </div>
      )}

      {/* 과물량 섹션 — 부분합 체크된 호차 전체를 하나로 묶어 표시 */}
      {subtotalSupportRows.length > 0 && (
        <div style={{ border: "1px solid #fca5a5", background: "#fff", padding: "20px 20px 16px", marginBottom: 16 }}>
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed["__ovq__"] !== false ? 0 : 14, flexWrap: "wrap", gap: 10, cursor: "pointer", userSelect: "none" }}
            onClick={() => toggleCollapse("__ovq__")}
          >
            <div>
              <span style={{ fontSize: 20, fontWeight: 950, color: "#991b1b" }}>과물량</span>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, marginLeft: 12 }}>
                {subtotalSupportRows.length}호차 · {subtotalSupportRows.map((r) => normalizeCarNo(r.carNo)).join(", ")}
              </span>
            </div>
            <span style={{ fontSize: 18, color: "#dc2626", fontWeight: 900 }}>{collapsed["__ovq__"] !== false ? "▶" : "▼"}</span>
          </div>
          {collapsed["__ovq__"] === false && (
            <div style={{ display: "table", width: "100%", borderCollapse: "collapse" }}>
              {subtotalSupportRows.map((item) => {
                const { carNo, largeTotal, smallTotal, large_box, large_inner, large_other, large_day2l, large_nb2l, small_low, small_high, event, tobacco, certificate, cdc } = item;
                const displayCarNo = normalizeCarNo(carNo);
                const copyKey = `ovq-${displayCarNo}`;
                const cardRef = getNoticeRef(copyKey);
                const extraNum = extraNumbers[carNo] ?? "";
                const fakeRow: CargoRow = { id: copyKey, car_no: carNo, seq_no: 0, store_code: "", store_name: "부분합", large_box, large_inner, large_other, large_day2l, large_nb2l, small_low, small_high, event, tobacco, certificate, cdc, pbox: 0, standard_time: "", address: "" };
                const cellBorder: React.CSSProperties = { borderTop: "1px solid #fee2e2", paddingTop: 9, paddingBottom: 9 };
                return (
                  <div key={carNo} style={{ display: "table-row" }}>
                    <span style={{ display: "table-cell", verticalAlign: "middle", paddingRight: 28, whiteSpace: "nowrap", fontSize: 16, fontWeight: 950, color: "#0f2940", ...cellBorder }}>{displayCarNo}호차</span>
                    <span style={{ display: "table-cell", verticalAlign: "middle", paddingRight: 8, whiteSpace: "nowrap", fontSize: 14, fontWeight: 900, color: "#1d4ed8", ...cellBorder }}>대 {largeTotal.toLocaleString()}</span>
                    <span style={{ display: "table-cell", verticalAlign: "middle", paddingRight: 8, whiteSpace: "nowrap", fontSize: 14, fontWeight: 900, color: "#166534", ...cellBorder }}>소 {smallTotal.toLocaleString()}</span>
                    <div style={{ display: "table-cell", verticalAlign: "middle", paddingRight: 8, ...cellBorder }}>
                      <input
                        type="number"
                        value={extraNum}
                        onChange={(e) => updateExtraNumber(carNo, e.target.value)}
                        placeholder="+추가금액"
                        className="ovq-extra-input"
                        style={{ width: 110, height: 32, padding: "0 8px", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 13, fontWeight: 700, color: "#dc2626", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "table-cell", verticalAlign: "middle", ...cellBorder }}>
                      <button
                        style={{ ...btnBase, background: copyStatus[copyKey] === "done" ? "#f0fdf4" : copyStatus[copyKey] === "error" ? "#fef2f2" : "linear-gradient(135deg,#991b1b 0%,#dc2626 100%)", color: (copyStatus[copyKey] === "done" || copyStatus[copyKey] === "error") ? "#374151" : "#fff", border: "1px solid #dc2626", opacity: copyStatus[copyKey] === "copying" ? 0.7 : 1, fontSize: 13, padding: "6px 14px", height: 32 }}
                        onClick={() => copyImage(copyKey, cardRef)}
                        disabled={copyStatus[copyKey] === "copying"}
                      >
                        {copyBtnLabel(copyKey, `${displayCarNo}호차 복사`)}
                      </button>
                      <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
                        <OverQuantityCarCard row={fakeRow} reportDate={reportDate} cardRef={cardRef} extraNumber={extraNum} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 운송게시판용 복사 섹션 */}
      {regularSupportRows.length > 0 && (() => {
        const boardRef = getNoticeRef("support-board");
        return (
          <div style={{ border: "1px solid #ddd6fe", background: "#faf5ff", padding: "16px 20px", marginBottom: 16, borderRadius: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#4c1d95" }}>📋 운송게시판 복사</div>
              <button
                style={{ ...btnBase, background: copyStatus["support-board"] === "done" ? "#f5f3ff" : copyStatus["support-board"] === "error" ? "#fef2f2" : "linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)", color: (copyStatus["support-board"] === "done" || copyStatus["support-board"] === "error") ? "#374151" : "#fff", border: "1px solid #7c3aed", opacity: copyStatus["support-board"] === "copying" ? 0.7 : 1, fontSize: 14, padding: "9px 18px" }}
                onClick={() => copyImage("support-board", boardRef)}
                disabled={copyStatus["support-board"] === "copying"}
              >
                {copyBtnLabel("support-board", "호차/순번/점포명/지원기사 복사")}
              </button>
            </div>
            <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
              <SupportBoardCard rows={regularSupportRows} reportDate={reportDate} cardRef={boardRef} />
            </div>
          </div>
        );
      })()}

      {/* 전체 선작업/이동점포 공지 섹션 */}
      {regularSupportRows.some((r) => noticeInputs[r.id]?.trim()) && (() => {
        const globalNoticeRef = getNoticeRef("global-notice");
        return (
          <div style={{ border: "1px solid #a7f3d0", background: "#f0fdf4", padding: "16px 20px", marginBottom: 16, borderRadius: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#065f46" }}>🏪 선작업/이동점포 공지</div>
              <button
                style={{ ...btnBase, background: copyStatus["global-notice"] === "done" ? "#f0fdf4" : copyStatus["global-notice"] === "error" ? "#fef2f2" : "linear-gradient(135deg,#065f46 0%,#059669 100%)", color: (copyStatus["global-notice"] === "done" || copyStatus["global-notice"] === "error") ? "#374151" : "#fff", border: "1px solid #059669", opacity: copyStatus["global-notice"] === "copying" ? 0.7 : 1, fontSize: 14, padding: "9px 18px" }}
                onClick={() => copyImage("global-notice", globalNoticeRef)}
                disabled={copyStatus["global-notice"] === "copying"}
              >
                {copyBtnLabel("global-notice", "선작업/이동점포 공지 복사")}
              </button>
            </div>
            {/* 숨김 전체 공지 카드 */}
            <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
              <StoreNoticeCardMulti rows={regularSupportRows} noticeMap={noticeInputs} reportDate={reportDate} cardRef={globalNoticeRef} />
            </div>
          </div>
        );
      })()}

      {groupedByDriver.map(([driverName, rows]) => {
        const driverKey = `driver-${driverName || "_unassigned"}`;
        const driverRef = getDriverGroupRef(driverKey);
        const carNos = [...new Set(rows.map((r) => normalizeCarNo(r.car_no)))].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
        const totalLarge = rows.reduce((s, r) => s + cargoTotals(r).largeTotal, 0);
        const totalSmall = rows.reduce((s, r) => s + cargoTotals(r).smallTotal, 0);
        // 회전별 집계
        const roundMap = new Map<string, { large: number; small: number }>();
        for (const r of rows) {
          const rv = roundInputs[r.id]?.trim() || "";
          const key = rv || "미입력";
          const prev = roundMap.get(key) ?? { large: 0, small: 0 };
          const { largeTotal: l, smallTotal: s } = cargoTotals(r);
          roundMap.set(key, { large: prev.large + l, small: prev.small + s });
        }
        const roundEntries = [...roundMap.entries()].sort((a, b) => {
          if (a[0] === "미입력") return 1;
          if (b[0] === "미입력") return -1;
          return Number(a[0]) - Number(b[0]);
        });

        const isCollapsed = collapsed[driverKey] !== false;
        return (
          <div key={driverKey} style={{ border: "1px solid #d6e4ee", background: "#fff", padding: "20px 20px 16px", marginBottom: 16 }}>
            {/* 기사 헤더 */}
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isCollapsed ? 0 : 10, flexWrap: "wrap", gap: 10, cursor: "pointer", userSelect: "none" }}
              onClick={() => toggleCollapse(driverKey)}
            >
              <div>
                <span style={{ fontSize: 20, fontWeight: 950, color: driverName ? "#4c1d95" : "#6b7280" }}>
                  {driverName ? `${driverName} 기사님` : "기사 미지정"}
                </span>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, marginLeft: 12 }}>
                  {rows.length}개 점포 · {carNos.join(", ")}호차
                  {isCollapsed && <span style={{ marginLeft: 10, color: "#1d4ed8" }}>대 {totalLarge.toLocaleString()}</span>}
                  {isCollapsed && <span style={{ marginLeft: 8, color: "#166534" }}>소 {totalSmall.toLocaleString()}</span>}
                </span>
              </div>
              <span style={{ fontSize: 18, color: "#7c3aed", fontWeight: 900 }}>{isCollapsed ? "▶" : "▼"}</span>
            </div>
            {/* 회전별 대/소 합계 */}
            {!isCollapsed && <div style={{ display: "flex", flexWrap: "nowrap", gap: 10, marginBottom: 14, overflowX: "auto" }}>
              {roundEntries.map(([round, { large, small }]) => (
                <div key={round} style={{ background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)", border: "1.5px solid #c4b5fd", borderRadius: 10, padding: "10px 20px", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", marginBottom: 6, letterSpacing: 1 }}>
                    {round === "미입력" ? "미입력" : `${round}회전`}
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 17, fontWeight: 900, color: "#6b7280" }}>대</span>
                      <span style={{ fontSize: 26, fontWeight: 950, color: "#1d4ed8", lineHeight: 1 }}>{large.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 17, fontWeight: 900, color: "#6b7280" }}>소</span>
                      <span style={{ fontSize: 26, fontWeight: 950, color: "#b45309", lineHeight: 1 }}>{small.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>}

            {/* 버튼 행 */}
            {!isCollapsed && <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button
                style={{ ...btnBase, background: copyStatus[driverKey] === "done" ? "#f0fdf4" : copyStatus[driverKey] === "error" ? "#fef2f2" : "linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)", color: (copyStatus[driverKey] === "done" || copyStatus[driverKey] === "error") ? "#374151" : "#fff", border: "1px solid #7c3aed", opacity: copyStatus[driverKey] === "copying" ? 0.7 : 1, fontSize: 14, padding: "9px 18px" }}
                onClick={() => copyImage(driverKey, driverRef)}
                disabled={copyStatus[driverKey] === "copying"}
              >
                🚗 {copyBtnLabel(driverKey, `${driverName ? driverName + " 기사" : "지원기사"} 메시지 복사`)}
              </button>
            </div>}

            {/* 점포 행 목록 */}
            {!isCollapsed && rows.map((row) => {
              const { largeTotal, smallTotal } = cargoTotals(row);
              const roundVal = roundInputs[row.id] ?? "";
              const noticeVal = noticeInputs[row.id] ?? "";

              return (
                <div key={row.id} style={{ borderTop: "1px solid #e9f0f5", paddingTop: 12, paddingBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* 회전 입력 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
                      <input
                        value={roundVal}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, "");
                          setRoundInputs((prev) => ({ ...prev, [row.id]: v }));
                          void saveRound(row.id, v);
                        }}
                        placeholder="–"
                        inputMode="numeric"
                        style={{ width: 48, height: 36, textAlign: "center", fontWeight: 950, fontSize: 16, border: "2px solid #c7d6e3", borderRadius: 6, outline: "none", color: "#4c1d95", background: roundVal ? "#f5f0ff" : "#fafafa" }}
                      />
                      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700 }}>회전</div>
                    </div>
                    {/* 점포 정보 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 950, color: "#0f2940", marginBottom: 4 }}>
                        {row.store_name}
                        {roundVal && <span style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginLeft: 8 }}>{roundVal}회전</span>}
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginLeft: 8 }}>{normalizeCarNo(row.car_no)}호차</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, fontWeight: 700 }}>
                        {row.standard_time && <span style={{ color: "#374151" }}>⏰ {row.standard_time}</span>}
                        <span style={{ color: "#1d4ed8" }}>대 {formatNumber(largeTotal)}</span>
                        <span style={{ color: "#166534" }}>소 {formatNumber(smallTotal)}</span>
                        {row.event > 0 && <span style={{ color: "#d97706" }}>행사 {formatNumber(row.event)}</span>}
                        {row.tobacco > 0 && <span style={{ color: "#7c3aed" }}>담배 {formatNumber(row.tobacco)}</span>}
                        {row.certificate > 0 && <span style={{ color: "#b45309" }}>유가증권 {formatNumber(row.certificate)}</span>}
                        {row.cdc > 0 && <span style={{ color: "#0369a1" }}>CDC {formatNumber(row.cdc)}</span>}
                      </div>
                      {row.address && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>📍 {row.address}</div>}
                    </div>
                    {/* 공지 내용 입력 */}
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700 }}>공지 내용</div>
                      <textarea
                        value={noticeVal}
                        onChange={(e) => {
                          const v = e.target.value;
                          setNoticeInputs((prev) => ({ ...prev, [row.id]: v }));
                          void saveNotice(row.id, v);
                        }}
                        placeholder="선작업/이동점포 공지 내용"
                        rows={3}
                        style={{ width: 200, padding: "6px 10px", fontSize: 12, fontWeight: 700, border: noticeVal ? "2px solid #059669" : "1px solid #c7d6e3", borderRadius: 6, outline: "none", resize: "vertical", background: noticeVal ? "#f0fdf4" : "#fafafa", color: "#111827", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 숨김 기사 메시지 카드 */}
            <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
              <DriverMessageCardHorizontal
                rows={rows}
                driverName={driverName}
                reportDate={reportDate}
                contactIndex={contactIndex}
                driverIndex={driverIndex}
                roundMap={roundInputs}
                cardRef={driverRef}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
