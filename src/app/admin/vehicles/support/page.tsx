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

// ── Utils ────────────────────────────────────────────────
function toText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();
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

// ── API ──────────────────────────────────────────────────
async function getVehicleAdminToken() {
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((r) => window.setTimeout(r, 250));
  }
  throw new Error("로그인 세션이 없습니다.");
}

async function fetchSupportData(): Promise<{ cargoRows: CargoRow[]; deliveryDate: string }> {
  const token = await getVehicleAdminToken();
  const response = await fetch("/api/admin/vehicles/current?includeSnapshot=1", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    snapshotUrl?: string;
    snapshot?: { productRows?: Array<{ delivery_date?: string }>; cargoRows?: CargoRow[] } | null;
  };
  if (!response.ok || !payload?.ok) throw new Error("서버 저장 데이터를 불러오지 못했습니다.");

  let snapshot = payload.snapshot;
  if (!snapshot && payload.snapshotUrl) {
    snapshot = await fetch(payload.snapshotUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
  }

  const cargoRows: CargoRow[] = Array.isArray(snapshot?.cargoRows) ? (snapshot!.cargoRows as CargoRow[]) : [];
  const deliveryDate = (snapshot?.productRows ?? []).find((r) => r.delivery_date)?.delivery_date ?? "";
  return { cargoRows, deliveryDate };
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
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #103b53 0%, #0f766e 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0,
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
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 950, color: "#0f2940", lineHeight: 1 }}>{formatNumber(largeTotal)}</div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 3 }}>대분</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 950, color: "#0f2940", lineHeight: 1 }}>{formatNumber(smallTotal)}</div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 3 }}>소분</div>
          </div>
          {row.event > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 950, color: "#d97706", lineHeight: 1 }}>{formatNumber(row.event)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 3 }}>행사</div>
            </div>
          )}
          {row.tobacco > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 950, color: "#7c3aed", lineHeight: 1 }}>{formatNumber(row.tobacco)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 3 }}>담배</div>
            </div>
          )}
          {row.certificate > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 950, color: "#b45309", lineHeight: 1 }}>{formatNumber(row.certificate)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 3 }}>유가증권</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 기사 메시지 카드 ─────────────────────────────────────
function DriverMessageCard({
  rows,
  driverName,
  carNo,
  reportDate,
  contactIndex,
  cardRef,
}: {
  rows: CargoRow[];
  driverName: string;
  carNo: string;
  reportDate: string;
  contactIndex: Map<string, string>;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
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
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          🚗
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0f2940", lineHeight: 1.3 }}>
            {driverName ? `${driverName} 기사님` : `${carNo}호차`} 지원 배송 안내
          </div>
          <div style={{ fontSize: 12, color: "#5a7385", marginTop: 2, fontWeight: 700 }}>{reportDate}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, i) => {
          const { largeTotal, smallTotal } = cargoTotals(row);
          const phone = contactIndex.get(row.store_name) ?? "";
          return (
            <div
              key={row.id}
              style={{
                background: i % 2 === 0 ? "#f8fafc" : "#f5f0ff",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 950, color: "#0f2940", marginBottom: 8, letterSpacing: -0.3 }}>
                {row.store_name}
              </div>
              {row.standard_time && (
                <div style={{ fontSize: 13, color: "#374151", fontWeight: 700, marginBottom: 4 }}>⏰ {row.standard_time}</div>
              )}
              {row.address && (
                <div style={{ fontSize: 12, color: "#374151", fontWeight: 700, marginBottom: 8, lineHeight: 1.5 }}>📍 {row.address}</div>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ background: "#dbeafe", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 800, color: "#1d4ed8" }}>
                  대 {formatNumber(largeTotal)}
                </span>
                <span style={{ background: "#dcfce7", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 800, color: "#166534" }}>
                  소 {formatNumber(smallTotal)}
                </span>
                {row.event > 0 && (
                  <span style={{ background: "#fef9c3", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 800, color: "#713f12" }}>
                    행사 {formatNumber(row.event)}
                  </span>
                )}
                {row.tobacco > 0 && (
                  <span style={{ background: "#f3e8ff", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 800, color: "#581c87" }}>
                    담배 {formatNumber(row.tobacco)}
                  </span>
                )}
                {row.certificate > 0 && (
                  <span style={{ background: "#fef3c7", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 800, color: "#78350f" }}>
                    유가증권 {formatNumber(row.certificate)}
                  </span>
                )}
              </div>
              {phone && (
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, marginTop: 6 }}>📞 {formatPhone(phone)}</div>
              )}
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
  const [deliveryDate, setDeliveryDate] = useState("");
  const [driverIndex, setDriverIndex] = useState<Map<string, DriverProfile>>(new Map());
  const [contactIndex, setContactIndex] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
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

  function getDriverRef(carNo: string) {
    if (!driverCardRefs.current.has(carNo)) {
      driverCardRefs.current.set(carNo, React.createRef<HTMLDivElement>());
    }
    return driverCardRefs.current.get(carNo)!;
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

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const { cargoRows: rows, deliveryDate: date } = await fetchSupportData();
        setCargoRows(rows);
        setDeliveryDate(date);
        const carNos = [...new Set(rows.filter((r) => r.support_excluded).map((r) => r.car_no))];
        const [drivers, contacts] = await Promise.all([fetchDriverIndex(carNos), fetchContactIndex()]);
        setDriverIndex(drivers);
        setContactIndex(contacts);
      } catch (e) {
        setError((e as Error)?.message ?? "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
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
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 950, color: "#0f2940", letterSpacing: -0.5 }}>지원 물동량</div>
        {reportDate && <div style={{ fontSize: 14, color: "#5a7385", fontWeight: 700, marginTop: 6 }}>{reportDate}</div>}
        <div style={{ fontSize: 13, color: "#374151", fontWeight: 700, marginTop: 6 }}>
          지원 체크 점포{" "}
          <strong style={{ color: "#0f2940" }}>{supportRows.length}개</strong>
          {groupedByCarNo.length > 0 && (
            <span style={{ color: "#6b7280" }}> · {groupedByCarNo.length}개 호차</span>
          )}
        </div>
      </div>

      {supportRows.length === 0 && (
        <div
          style={{
            border: "1px solid #d6e4ee",
            background: "#fff",
            padding: "32px 24px",
            color: "#6b7280",
            fontWeight: 700,
            fontSize: 15,
            textAlign: "center",
          }}
        >
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
        const driverRef = getDriverRef(carNo);
        const driverKey = `driver-${carNo}`;

        return (
          <div
            key={carNo}
            style={{
              border: "1px solid #d6e4ee",
              background: "#fff",
              padding: "20px 20px 16px",
              marginBottom: 16,
            }}
          >
            {/* 호차 헤더 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <span style={{ fontSize: 20, fontWeight: 950, color: "#0f2940" }}>{carNo}호차</span>
                {driver && (
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#5a7385", marginLeft: 12 }}>
                    {driver.name}
                    {driver.phone ? ` · ${formatPhone(driver.phone)}` : ""}
                  </span>
                )}
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, marginLeft: 12 }}>
                  지원 {rows.length}개 점포
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={{
                    ...btnBase,
                    background: copyStatus[driverKey] === "done"
                      ? "#f0fdf4"
                      : copyStatus[driverKey] === "error"
                      ? "#fef2f2"
                      : "linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)",
                    color: (copyStatus[driverKey] === "done" || copyStatus[driverKey] === "error") ? "#374151" : "#fff",
                    border: "1px solid #7c3aed",
                    opacity: copyStatus[driverKey] === "copying" ? 0.7 : 1,
                  }}
                  onClick={() => copyImage(driverKey, driverRef)}
                  disabled={copyStatus[driverKey] === "copying"}
                >
                  🚗 {copyBtnLabel(driverKey, "기사 메시지 이미지 복사")}
                </button>
                <Link
                  href={`/admin/vehicles/report?carNo=${encodeURIComponent(carNo)}`}
                  style={{
                    ...btnBase,
                    background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
                    color: "#fff",
                    border: "1px solid #0e7490",
                    textDecoration: "none",
                  }}
                >
                  운행일보 열기 →
                </Link>
              </div>
            </div>

            {/* 점포 행 목록 */}
            {rows.map((row) => {
              const { largeTotal, smallTotal } = cargoTotals(row);
              const storeRef = getStoreRef(row.id);
              const storeKey = `store-${row.id}`;

              return (
                <div
                  key={row.id}
                  style={{
                    borderTop: "1px solid #e9f0f5",
                    paddingTop: 14,
                    paddingBottom: 14,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 16, fontWeight: 950, color: "#0f2940", marginBottom: 6, letterSpacing: -0.3 }}>
                      {row.store_name}
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, fontWeight: 700 }}>
                      {row.standard_time && <span style={{ color: "#374151" }}>⏰ {row.standard_time}</span>}
                      <span style={{ color: "#1d4ed8" }}>대 {formatNumber(largeTotal)}</span>
                      <span style={{ color: "#166534" }}>소 {formatNumber(smallTotal)}</span>
                      {row.event > 0 && <span style={{ color: "#d97706" }}>행사 {formatNumber(row.event)}</span>}
                      {row.tobacco > 0 && <span style={{ color: "#7c3aed" }}>담배 {formatNumber(row.tobacco)}</span>}
                      {row.certificate > 0 && <span style={{ color: "#b45309" }}>유가증권 {formatNumber(row.certificate)}</span>}
                    </div>
                    {row.address && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 5, fontWeight: 600 }}>📍 {row.address}</div>
                    )}
                  </div>
                  <button
                    style={{
                      ...btnBase,
                      background: copyStatus[storeKey] === "done"
                        ? "#f0fdf4"
                        : copyStatus[storeKey] === "error"
                        ? "#fef2f2"
                        : "linear-gradient(135deg,#065f46 0%,#059669 100%)",
                      color: (copyStatus[storeKey] === "done" || copyStatus[storeKey] === "error") ? "#374151" : "#fff",
                      border: "1px solid #059669",
                      opacity: copyStatus[storeKey] === "copying" ? 0.7 : 1,
                    }}
                    onClick={() => copyImage(storeKey, storeRef)}
                    disabled={copyStatus[storeKey] === "copying"}
                  >
                    🏪 {copyBtnLabel(storeKey, "이동점포 공지 복사")}
                  </button>
                </div>
              );
            })}

            {/* 숨겨진 이미지 카드 (클립보드 캡처용) */}
            <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
              <DriverMessageCard
                rows={rows}
                driverName={driver?.name ?? ""}
                carNo={carNo}
                reportDate={reportDate}
                contactIndex={contactIndex}
                cardRef={driverRef}
              />
            </div>
            {rows.map((row) => (
              <div key={`hidden-store-${row.id}`} style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", zIndex: -1 }}>
                <StoreNoticeCard row={row} reportDate={reportDate} cardRef={getStoreRef(row.id)} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
