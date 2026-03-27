"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────
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

// ── IndexedDB (메인 페이지와 동일한 DB 공유) ──────────────
const VEHICLE_DB_NAME = "han-admin-vehicles";
const VEHICLE_STORE_NAME = "vehicle-page";
const VEHICLE_STORE_KEY = "current";

function openVehicleDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(VEHICLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VEHICLE_STORE_NAME)) {
        db.createObjectStore(VEHICLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLocalSnapshot(): Promise<{ cargoRows: CargoRow[]; deliveryDate: string; fileName?: string } | null> {
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
    const cargoRows = Array.isArray(data.cargoRows) ? (data.cargoRows as CargoRow[]) : [];
    const productRows = Array.isArray(data.productRows) ? (data.productRows as Array<{ delivery_date?: string }>) : [];
    const deliveryDate = productRows.find((r) => r.delivery_date)?.delivery_date ?? "";
    return { cargoRows, deliveryDate, fileName: data.fileName as string | undefined };
  } catch {
    return null;
  }
}

// ── Utils ────────────────────────────────────────────────
function toText(value: unknown) {
  return String(value ?? "").replace(/\r/g, " ").replace(/\n/g, " ").trim();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

function normalizeCarNo(value: unknown) {
  return toText(value).replace(/\s+/g, "");
}

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
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

// ── API (서버에서 최신 데이터 가져오기) ───────────────────
async function getToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) return token;
  // 세션 없으면 잠깐 대기 후 재시도
  await new Promise((r) => setTimeout(r, 300));
  const { data: data2 } = await supabase.auth.getSession();
  return data2.session?.access_token ?? null;
}

async function fetchServerSnapshot(): Promise<{ cargoRows: CargoRow[]; deliveryDate: string; fileName?: string } | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    const response = await fetch("/api/admin/vehicles/current?includeSnapshot=1", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      snapshotUrl?: string;
      snapshot?: { fileName?: string; productRows?: Array<{ delivery_date?: string }>; cargoRows?: CargoRow[] } | null;
    };
    if (!response.ok || !payload?.ok) return null;

    let snapshot = payload.snapshot;
    if (!snapshot && payload.snapshotUrl) {
      snapshot = await fetch(payload.snapshotUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    }
    if (!snapshot) return null;

    const cargoRows: CargoRow[] = Array.isArray(snapshot.cargoRows) ? (snapshot.cargoRows as CargoRow[]) : [];
    const deliveryDate = (snapshot.productRows ?? []).find((r) => r.delivery_date)?.delivery_date ?? "";
    return { cargoRows, deliveryDate, fileName: snapshot.fileName };
  } catch {
    return null;
  }
}

async function fetchDriverIndex(carNos: string[]): Promise<Map<string, DriverProfile>> {
  const normalized = [...new Set(carNos.map(normalizeCarNo).filter(Boolean))];
  if (normalized.length === 0) return new Map();
  const carNoFilter = normalized.map((n) => `car_no.ilike.%${n}%`).join(",");
  const { data, error } = await supabase
    .from("profiles")
    .select("name,phone,car_no,vehicle_type,carrier,garage,vehicle_number")
    .ilike("work_part", "%기사%")
    .or(carNoFilter);
  if (error) return new Map();

  const index = new Map<string, DriverProfile>();
  for (const row of data ?? []) {
    const tokens = normalizeCarNo((row as Record<string, unknown>).car_no)
      .split(/[\/,|]/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const token of tokens) {
      if (!normalized.includes(token) || index.has(token)) continue;
      index.set(token, {
        name: toText((row as Record<string, unknown>).name),
        phone: toText((row as Record<string, unknown>).phone),
        car_no: token,
        vehicle_type: toText((row as Record<string, unknown>).vehicle_type),
        carrier: toText((row as Record<string, unknown>).carrier),
        garage: toText((row as Record<string, unknown>).garage),
        vehicle_number: toText((row as Record<string, unknown>).vehicle_number),
      });
    }
  }
  return index;
}

async function fetchContactIndex(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("store_contacts").select("store_name,phone");
  if (error) return new Map();
  const index = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.store_name && row.phone && !index.has(row.store_name)) {
      index.set(row.store_name, String(row.phone));
    }
  }
  return index;
}

// ── 이동점포 공지 카드 ────────────────────────────────────
function StoreNoticeCard({
  row,
  reportDate,
  cardRef,
}: {
  row: CargoRow;
  reportDate: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { largeTotal, smallTotal } = cargoTotals(row);
  return (
    <div
      ref={cardRef}
      style={{
        width: 380,
        background: "#fff",
        borderRadius: 16,
        padding: "28px 28px 24px",
        fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        boxSizing: "border-box",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "linear-gradient(135deg, #103b53 0%, #0f766e 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}
        >
          🚚
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#0f2940", lineHeight: 1.2 }}>이동점포 공지</div>
          <div style={{ fontSize: 12, color: "#5a7385", marginTop: 2, fontWeight: 700 }}>한아시스템</div>
        </div>
      </div>

      <div style={{ background: "#f0f9ff", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0369a1" }}>{reportDate}</div>
        <div style={{ fontSize: 19, fontWeight: 950, color: "#0f2940", marginTop: 4, letterSpacing: -0.3 }}>{row.store_name}</div>
      </div>

      <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {row.standard_time && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⏰</span>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>도착 예정</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>{row.standard_time}</div>
            </div>
          </div>
        )}
        {row.address && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>📍</span>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>배송 주소</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.5 }}>{row.address}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 10 }}>물동량</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[
            { label: "대분", value: largeTotal, color: "#0f2940" },
            { label: "소분", value: smallTotal, color: "#0f2940" },
            ...(row.event > 0 ? [{ label: "행사", value: row.event, color: "#d97706" }] : []),
            ...(row.tobacco > 0 ? [{ label: "담배", value: row.tobacco, color: "#7c3aed" }] : []),
            ...(row.certificate > 0 ? [{ label: "유가증권", value: row.certificate, color: "#b45309" }] : []),
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 950, color, lineHeight: 1 }}>{formatNumber(value)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 기사 메시지 카드 ──────────────────────────────────────
function DriverMessageCard({
  row,
  carNo,
  reportDate,
  contactIndex,
  cardRef,
}: {
  row: CargoRow;
  carNo: string;
  reportDate: string;
  contactIndex: Map<string, string>;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { largeTotal, smallTotal } = cargoTotals(row);
  const driverName = row.note?.trim() ?? "";
  const phone = contactIndex.get(row.store_name) ?? "";

  const fieldRow = (label: string, value: number | string, bold = false) => {
    const isEmpty = value === 0 || value === "";
    if (isEmpty) return null;
    return (
      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #f0f4f7" }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: bold ? 950 : 800, color: "#111827" }}>{typeof value === "number" ? formatNumber(value) : value}</span>
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      style={{
        width: 420,
        background: "#fff",
        borderRadius: 16,
        padding: "24px 24px 20px",
        fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        boxSizing: "border-box",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}
        >
          🚗
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0f2940", lineHeight: 1.3 }}>
            {driverName ? `${driverName} 기사님` : `지원기사`} 배송 안내
          </div>
          <div style={{ fontSize: 12, color: "#5a7385", marginTop: 2, fontWeight: 700 }}>{reportDate}</div>
        </div>
      </div>

      <div style={{ background: "#f5f0ff", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 950, color: "#0f2940", marginBottom: 8, letterSpacing: -0.3 }}>{row.store_name}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: "#6b7280" }}>호차 <strong style={{ color: "#0f2940" }}>{carNo}</strong></span>
          {row.seq_no > 0 && <span style={{ color: "#6b7280" }}>순번 <strong style={{ color: "#0f2940" }}>{row.seq_no}</strong></span>}
          {row.store_code && <span style={{ color: "#6b7280" }}>점포코드 <strong style={{ color: "#0f2940" }}>{row.store_code}</strong></span>}
        </div>
      </div>

      <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {row.standard_time && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⏰</span>
            <div>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>기준시간 </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#111827" }}>{row.standard_time}</span>
            </div>
          </div>
        )}
        {row.address && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.5 }}>{row.address}</div>
          </div>
        )}
        {phone && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>📞</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#374151" }}>{formatPhone(phone)}</span>
          </div>
        )}
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>물동량 상세</div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "2px solid #e0f2fe" }}>
            <span style={{ fontSize: 13, fontWeight: 950, color: "#0369a1" }}>대분 합계</span>
            <span style={{ fontSize: 16, fontWeight: 950, color: "#0369a1" }}>{formatNumber(largeTotal)}</span>
          </div>
          <div style={{ paddingLeft: 8, marginTop: 2 }}>
            {fieldRow("박스존", row.large_box)}
            {fieldRow("이너존", row.large_inner)}
            {fieldRow("기타", row.large_other)}
            {fieldRow("올데이 2L생수", row.large_day2l)}
            {fieldRow("노브랜드 2L생수", row.large_nb2l)}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "2px solid #dcfce7" }}>
            <span style={{ fontSize: 13, fontWeight: 950, color: "#166534" }}>소분 합계</span>
            <span style={{ fontSize: 16, fontWeight: 950, color: "#166534" }}>{formatNumber(smallTotal)}</span>
          </div>
          <div style={{ paddingLeft: 8, marginTop: 2 }}>
            {fieldRow("경량존", row.small_low)}
            {fieldRow("슬라존", row.small_high)}
          </div>
        </div>

        {(row.event > 0 || row.tobacco > 0 || row.certificate > 0 || row.cdc > 0) && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", padding: "5px 0", borderBottom: "1px solid #e9f0f5", marginBottom: 2 }}>기타</div>
            <div style={{ paddingLeft: 8 }}>
              {fieldRow("행사", row.event)}
              {fieldRow("담배", row.tobacco)}
              {fieldRow("유가증권", row.certificate)}
              {fieldRow("CDC", row.cdc)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
export default function SupportPage() {
  const [cargoRows, setCargoRows] = useState<CargoRow[]>([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [driverIndex, setDriverIndex] = useState<Map<string, DriverProfile>>(new Map());
  const [contactIndex, setContactIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<Record<string, "copying" | "done" | "error">>({});

  const storeCardRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());
  const driverCardRefs = useRef<Map<string, React.RefObject<HTMLDivElement | null>>>(new Map());

  function getStoreRef(rowId: string) {
    if (!storeCardRefs.current.has(rowId)) {
      storeCardRefs.current.set(rowId, React.createRef<HTMLDivElement>());
    }
    return storeCardRefs.current.get(rowId)!;
  }

  function getDriverRef(rowId: string) {
    if (!driverCardRefs.current.has(rowId)) {
      driverCardRefs.current.set(rowId, React.createRef<HTMLDivElement>());
    }
    return driverCardRefs.current.get(rowId)!;
  }

  const supportRows = useMemo(() => cargoRows.filter((r) => r.support_excluded), [cargoRows]);

  const groupedByCarNo = useMemo(() => {
    const groups = new Map<string, CargoRow[]>();
    for (const row of supportRows) {
      const key = normalizeCarNo(row.car_no);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko", { numeric: true }));
  }, [supportRows]);

  const reportDate = useMemo(() => formatDisplayDate(deliveryDate), [deliveryDate]);

  // 기사/연락처 인덱스 로드 (cargoRows가 설정된 후 호출)
  async function loadIndexes(rows: CargoRow[]) {
    const carNos = [...new Set(rows.filter((r) => r.support_excluded).map((r) => normalizeCarNo(r.car_no)))];
    const [drivers, contacts] = await Promise.all([fetchDriverIndex(carNos), fetchContactIndex()]);
    setDriverIndex(drivers);
    setContactIndex(contacts);
  }

  useEffect(() => {
    void (async () => {
      // 1단계: IndexedDB에서 즉시 로드
      const local = await readLocalSnapshot();
      if (local) {
        setCargoRows(local.cargoRows);
        setDeliveryDate(local.deliveryDate);
        setLoading(false);
        // 인덱스는 백그라운드로 병렬 로드
        void loadIndexes(local.cargoRows);
        // 2단계: 서버에서 최신 데이터 백그라운드 갱신
        setRefreshing(true);
        const server = await fetchServerSnapshot();
        setRefreshing(false);
        if (server && server.fileName !== local.fileName) {
          setCargoRows(server.cargoRows);
          setDeliveryDate(server.deliveryDate);
          void loadIndexes(server.cargoRows);
        }
        return;
      }

      // IndexedDB에 없으면 서버에서 로드
      try {
        const server = await fetchServerSnapshot();
        if (!server) throw new Error("서버 저장 데이터를 불러오지 못했습니다.");
        setCargoRows(server.cargoRows);
        setDeliveryDate(server.deliveryDate);
        void loadIndexes(server.cargoRows);
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
      const server = await fetchServerSnapshot();
      if (server) {
        setCargoRows(server.cargoRows);
        setDeliveryDate(server.deliveryDate);
        void loadIndexes(server.cargoRows);
      }
    } finally {
      setRefreshing(false);
    }
  };

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

  const copyBtnLabel = (key: string, defaultLabel: string) => {
    if (copyStatus[key] === "copying") return "복사 중...";
    if (copyStatus[key] === "done") return "복사됨 ✓";
    if (copyStatus[key] === "error") return "복사 실패 ✕";
    return defaultLabel;
  };

  const btnBase: React.CSSProperties = {
    padding: "7px 14px",
    borderRadius: 4,
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    border: "none",
  };

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280", fontWeight: 800, fontSize: 14 }}>데이터 불러오는 중...</div>;
  }

  if (error) {
    return <div style={{ padding: 24, color: "#b91c1c", fontWeight: 800, fontSize: 14 }}>{error}</div>;
  }

  return (
    <div style={{ fontFamily: "Pretendard, system-ui, sans-serif" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 950, color: "#0f2940", letterSpacing: -0.5 }}>지원 물동량</div>
          {reportDate && <div style={{ fontSize: 14, color: "#5a7385", fontWeight: 700, marginTop: 6 }}>{reportDate}</div>}
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 700, marginTop: 6 }}>
            지원 체크 점포{" "}
            <strong style={{ color: "#0f2940" }}>{supportRows.length}개</strong>
            {groupedByCarNo.length > 0 && <span style={{ color: "#6b7280" }}> · {groupedByCarNo.length}개 호차</span>}
            {refreshing && <span style={{ color: "#0369a1", marginLeft: 10, fontSize: 12 }}>서버 동기화 중...</span>}
          </div>
        </div>
        <button
          onClick={manualRefresh}
          disabled={refreshing}
          style={{
            ...btnBase,
            background: refreshing ? "#e2e8f0" : "#f1f5f9",
            color: "#374151",
            border: "1px solid #cbd5e1",
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          {refreshing ? "동기화 중..." : "새로고침"}
        </button>
      </div>

      {supportRows.length === 0 && (
        <div style={{ border: "1px solid #d6e4ee", background: "#fff", padding: "32px 24px", color: "#6b7280", fontWeight: 700, fontSize: 15, textAlign: "center" }}>
          지원 체크된 점포가 없습니다.
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <Link href="/admin/vehicles" style={{ color: "#0f766e", textDecoration: "none", fontWeight: 800 }}>
              물동량 페이지에서 지원 체크 →
            </Link>
          </div>
        </div>
      )}

      {groupedByCarNo.map(([carNo, rows]) => {
        const driver = driverIndex.get(carNo);

        return (
          <div key={carNo} style={{ border: "1px solid #d6e4ee", background: "#fff", padding: "20px 20px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 950, color: "#0f2940" }}>{carNo}호차</span>
                {driver && (
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#5a7385", marginLeft: 12 }}>
                    {driver.name}{driver.phone ? ` · ${formatPhone(driver.phone)}` : ""}
                  </span>
                )}
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, marginLeft: 12 }}>지원 {rows.length}개 점포</span>
              </div>
              <Link
                href={`/admin/vehicles/report?carNo=${encodeURIComponent(carNo)}`}
                style={{ ...btnBase, background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "#fff", border: "1px solid #0e7490", textDecoration: "none" }}
              >
                운행일보 열기 →
              </Link>
            </div>

            {rows.map((row) => {
              const { largeTotal, smallTotal } = cargoTotals(row);
              const storeRef = getStoreRef(row.id);
              const driverRef = getDriverRef(row.id);
              const storeKey = `store-${row.id}`;
              const driverKey = `driver-${row.id}`;
              const supportDriverName = row.note?.trim() ?? "";

              return (
                <div key={row.id} style={{ borderTop: "1px solid #e9f0f5", paddingTop: 14, paddingBottom: 14 }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 950, color: "#0f2940", marginBottom: 6, letterSpacing: -0.3 }}>
                      {row.store_name}
                      {supportDriverName && (
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", marginLeft: 10 }}>
                          → {supportDriverName} 기사님
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, fontWeight: 700 }}>
                      {row.standard_time && <span style={{ color: "#374151" }}>⏰ {row.standard_time}</span>}
                      <span style={{ color: "#1d4ed8" }}>대 {formatNumber(largeTotal)}</span>
                      <span style={{ color: "#166534" }}>소 {formatNumber(smallTotal)}</span>
                      {row.event > 0 && <span style={{ color: "#d97706" }}>행사 {formatNumber(row.event)}</span>}
                      {row.tobacco > 0 && <span style={{ color: "#7c3aed" }}>담배 {formatNumber(row.tobacco)}</span>}
                      {row.certificate > 0 && <span style={{ color: "#b45309" }}>유가증권 {formatNumber(row.certificate)}</span>}
                      {row.cdc > 0 && <span style={{ color: "#0369a1" }}>CDC {formatNumber(row.cdc)}</span>}
                    </div>
                    {row.address && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 5, fontWeight: 600 }}>📍 {row.address}</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={{
                        ...btnBase,
                        background: copyStatus[storeKey] === "done" ? "#f0fdf4" : copyStatus[storeKey] === "error" ? "#fef2f2" : "linear-gradient(135deg,#065f46 0%,#059669 100%)",
                        color: (copyStatus[storeKey] === "done" || copyStatus[storeKey] === "error") ? "#374151" : "#fff",
                        border: "1px solid #059669",
                        opacity: copyStatus[storeKey] === "copying" ? 0.7 : 1,
                      }}
                      onClick={() => copyImage(storeKey, storeRef)}
                      disabled={copyStatus[storeKey] === "copying"}
                    >
                      🏪 {copyBtnLabel(storeKey, "이동점포 공지 복사")}
                    </button>
                    <button
                      style={{
                        ...btnBase,
                        background: copyStatus[driverKey] === "done" ? "#f0fdf4" : copyStatus[driverKey] === "error" ? "#fef2f2" : "linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)",
                        color: (copyStatus[driverKey] === "done" || copyStatus[driverKey] === "error") ? "#374151" : "#fff",
                        border: "1px solid #7c3aed",
                        opacity: copyStatus[driverKey] === "copying" ? 0.7 : 1,
                      }}
                      onClick={() => copyImage(driverKey, driverRef)}
                      disabled={copyStatus[driverKey] === "copying"}
                    >
                      🚗 {copyBtnLabel(driverKey, `${supportDriverName ? supportDriverName + " 기사" : "지원기사"} 메시지 복사`)}
                    </button>
                  </div>

                  <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
                    <StoreNoticeCard row={row} reportDate={reportDate} cardRef={storeRef} />
                  </div>
                  <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
                    <DriverMessageCard row={row} carNo={carNo} reportDate={reportDate} contactIndex={contactIndex} cardRef={driverRef} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
