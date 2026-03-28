"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type ProductRow = {
  warehouse_code: string;
  outbound_no: string;
  outbound_detail_no: string;
  wave_no: string;
  wave_name: string;
  delivery_date: string;
  outbound_type: string;
  assign_status: string;
  delivery_round: string;
  car_no: string;
  seq_no: number;
  store_code: string;
  store_name: string;
  priority_code: string;
  slip_no: string;
  product_code: string;
  product_name: string;
  cell_name: string;
  order_unit: number;
  original_qty: number;
  current_qty: number;
  assigned_qty: number;
  picking_qty: number;
  diff_qty: number;
  confirmed_qty: number;
  store_check_qty: number;
  center_unit: number;
  outer_box_unit: number;
  work_type: string;
  facility_type: string;
  full_box_yn: string;
  shortage_type: string;
  shortage_reason: string;
  amount: number;
  outbound_condition: string;
  outbound_confirm_yn: string;
  delivery_due_time?: string;
  address?: string;
};

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

type StoreMapMatch = {
  store_code: string;
  store_name?: string;
  car_no: string;
  seq_no: number;
  delivery_due_time: string;
  address: string;
};

type DriverProfile = {
  name: string;
  phone: string;
  car_no: string;
  delivery_type?: string;
  vehicle_type: string;
  carrier: string;
  garage: string;
  vehicle_number: string;
};

type ReportGroup = {
  carNo: string;
  rows: CargoRow[];
  driver?: DriverProfile;
  supportDriverName?: string;
  supportStoreName?: string;
  supportRound?: string;
  totals: {
    large: number;
    small: number;
    event: number;
    tobacco: number;
    certificate: number;
    cdc: number;
    pbox: number;
    water: number;
  };
};


const VEHICLE_DB_NAME = "han-admin-vehicles";
const VEHICLE_STORE_NAME = "vehicle-page";
const VEHICLE_STORE_KEY = "current";
const VEHICLE_LIMITS_KEY = "limits";

type VehicleSnapshot = {
  fileName: string;
  productRows: ProductRow[];
  cargoRows: CargoRow[];
  uploadedAt?: string;
  uploadedBy?: string;
};

type VehicleLimitsSnapshot = {
  largeLimit?: number;
  smallLimit?: number;
};

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
  uploadedAt?: string;
  uploadedBy?: string;
  driverStats: AdhesionDriverStat[];
  storeStats: AdhesionStoreStat[];
};

type CdcStoreStat = {
  storeCode: string;
  storeName: string;
  maxBoxNo: number;
};

type CdcFullBoxStat = {
  storeCode: string;
  storeName: string;
  maxBoxNo: number;
};

type CdcSnapshot = {
  fileName: string;
  fullBoxFileName?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  rows: CdcStoreStat[];
  fullBoxRows?: CdcFullBoxStat[];
};

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
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function readVehicleSnapshot() {
  const db = await openVehicleDb();
  return new Promise<VehicleSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE_NAME, "readonly");
    const store = tx.objectStore(VEHICLE_STORE_NAME);
    const request = store.get(VEHICLE_STORE_KEY);

    request.onsuccess = () => {
      resolve((request.result as VehicleSnapshot | undefined) ?? null);
      db.close();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB read failed"));
      db.close();
    };
  });
}

async function writeVehicleSnapshot(snapshot: VehicleSnapshot) {
  const db = await openVehicleDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE_NAME, "readwrite");
    const store = tx.objectStore(VEHICLE_STORE_NAME);
    const request = store.put(snapshot, VEHICLE_STORE_KEY);

    request.onsuccess = () => {
      resolve();
      db.close();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB write failed"));
      db.close();
    };
  });
}

async function readVehicleLimitsSnapshot() {
  const db = await openVehicleDb();
  return new Promise<VehicleLimitsSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE_NAME, "readonly");
    const store = tx.objectStore(VEHICLE_STORE_NAME);
    const request = store.get(VEHICLE_LIMITS_KEY);

    request.onsuccess = () => {
      resolve((request.result as VehicleLimitsSnapshot | undefined) ?? null);
      db.close();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB read failed"));
      db.close();
    };
  });
}

async function writeVehicleLimitsSnapshot(snapshot: VehicleLimitsSnapshot) {
  const db = await openVehicleDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE_NAME, "readwrite");
    const store = tx.objectStore(VEHICLE_STORE_NAME);
    const request = store.put(snapshot, VEHICLE_LIMITS_KEY);

    request.onsuccess = () => {
      resolve();
      db.close();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB write failed"));
      db.close();
    };
  });
}

async function clearVehicleSnapshot() {
  const db = await openVehicleDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VEHICLE_STORE_NAME, "readwrite");
    const store = tx.objectStore(VEHICLE_STORE_NAME);
    const request = store.delete(VEHICLE_STORE_KEY);

    request.onsuccess = () => {
      resolve();
      db.close();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB delete failed"));
      db.close();
    };
  });
}

async function getVehicleAdminToken() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  throw new Error("로그인 세션이 없습니다.");
}

async function fetchServerVehicleSnapshot() {
  const token = await getVehicleAdminToken();
  const response = await fetch("/api/admin/vehicles/current?includeLimits=1&includeReportBase=1", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshotUrl?: string | null;
    limitsUrl?: string | null;
    snapshot?: VehicleSnapshot | null;
    limits?: VehicleLimitsSnapshot | null;
    reportBaseRows?: CargoRow[] | null;
    validStoreCodes?: string[] | null;
  };

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "서버 저장 데이터를 불러오지 못했습니다.");
  }

  // 스냅샷은 signed URL로 직접 다운로드 (서버 경유 없이)
  let snapshot: VehicleSnapshot | null =
    payload.snapshot ??
    (payload.snapshotUrl
      ? ((await fetch(payload.snapshotUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))) as VehicleSnapshot | null)
      : null);

  // store_map 유효 코드로 삭제된 점포 필터링 (클라이언트에서 처리)
  if (snapshot?.cargoRows && Array.isArray(payload.validStoreCodes) && payload.validStoreCodes.length > 0) {
    const validSet = new Set(payload.validStoreCodes);
    snapshot = {
      ...snapshot,
      cargoRows: snapshot.cargoRows.filter(
        (row) => !row.store_code || validSet.has(row.store_code.replace(/\D/g, "").padStart(5, "0").slice(0, 5))
      ),
    };
  }

  const limits =
    payload.limits ??
    (payload.limitsUrl
      ? ((await fetch(payload.limitsUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))) as VehicleLimitsSnapshot | null)
      : null);

  return {
    snapshot,
    limits,
    reportBaseRows: Array.isArray(payload.reportBaseRows) ? payload.reportBaseRows : [],
  };
}

async function fetchVehicleAdhesionSnapshot() {
  const token = await getVehicleAdminToken();
  const response = await fetch("/api/admin/vehicles/adhesion", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshot?: AdhesionSnapshot | null;
  };

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "점착 데이터를 불러오지 못했습니다.");
  }

  return payload.snapshot ?? null;
}

async function fetchVehicleCdcSnapshot() {
  const token = await getVehicleAdminToken();
  const response = await fetch("/api/admin/vehicles/cdc", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshot?: CdcSnapshot | null;
  };

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "CDC 데이터를 불러오지 못했습니다.");
  }

  return payload.snapshot ?? null;
}

async function uploadVehicleFileToServer(file: File) {
  const token = await getVehicleAdminToken();
  const uploadUrlResponse = await fetch("/api/admin/vehicles/upload-url", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fileName: file.name }),
  });

  const uploadUrlPayload = (await uploadUrlResponse.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    bucket?: string;
    path?: string;
    token?: string;
  };

  if (!uploadUrlResponse.ok || !uploadUrlPayload?.ok || !uploadUrlPayload.bucket || !uploadUrlPayload.path || !uploadUrlPayload.token) {
    throw new Error(uploadUrlPayload?.message || "업로드 준비에 실패했습니다.");
  }

  const storageUpload = await supabase.storage
    .from(uploadUrlPayload.bucket)
    .uploadToSignedUrl(uploadUrlPayload.path, uploadUrlPayload.token, file);

  if (storageUpload.error) {
    throw new Error(storageUpload.error.message || "스토리지 업로드에 실패했습니다.");
  }

  const response = await fetch("/api/admin/vehicles/current", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: uploadUrlPayload.path,
      fileName: file.name,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshot?: VehicleSnapshot;
    matchedCount?: number;
  };

  if (!response.ok || !payload?.ok || !payload.snapshot) {
    throw new Error(payload?.message || "서버 업로드에 실패했습니다.");
  }

  return {
    snapshot: payload.snapshot,
    matchedCount: Number(payload.matchedCount ?? 0),
  };
}

async function clearServerVehicleSnapshot() {
  const token = await getVehicleAdminToken();
  const response = await fetch("/api/admin/vehicles/current", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
  };

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "서버 저장 데이터 초기화에 실패했습니다.");
  }
}

async function saveServerVehicleSnapshot(fileName: string, productRows: ProductRow[], cargoRows: CargoRow[]) {
  const token = await getVehicleAdminToken();
  const snapshot = { fileName, productRows, cargoRows, uploadedAt: new Date().toISOString(), uploadedBy: "" };
  const response = await fetch("/api/admin/vehicles/current", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ snapshot }),
  });

  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "서버 작업 데이터 저장에 실패했습니다.");
  }
}

async function saveServerVehicleLimits(snapshot: VehicleLimitsSnapshot) {
  const token = await getVehicleAdminToken();
  const response = await fetch("/api/admin/vehicles/current", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ limits: snapshot }),
  });

  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "서버 기준값 저장에 실패했습니다.");
  }
}


const cargoColumns: Array<{ key: keyof CargoRow | "largeTotal" | "smallTotal" | "support"; label: string; width?: number }> = [
  { key: "support", label: "지원", width: 64 },
  { key: "car_no", label: "호차", width: 80 },
  { key: "seq_no", label: "순번", width: 70 },
  { key: "store_code", label: "점포코드", width: 110 },
  { key: "store_name", label: "점포명", width: 180 },
  { key: "largeTotal", label: "대", width: 80 },
  { key: "large_box", label: "박스존", width: 80 },
  { key: "large_inner", label: "이너존", width: 80 },
  { key: "large_other", label: "기타", width: 80 },
  { key: "large_day2l", label: "올데이 2L생수", width: 92 },
  { key: "large_nb2l", label: "노브랜드2L생수", width: 92 },
  { key: "smallTotal", label: "소", width: 80 },
  { key: "small_low", label: "경량존", width: 80 },
  { key: "small_high", label: "슬라존", width: 80 },
  { key: "event", label: "행사", width: 80 },
  { key: "tobacco", label: "담배", width: 80 },
  { key: "certificate", label: "유가증권", width: 90 },
  { key: "note", label: "지원기사", width: 180 },
];

const stickyCargoColumnKeys = ["support", "car_no", "seq_no", "store_code", "store_name"] as const;
const reportMainColumnWidths = [
  42,   // 0  No
  180,  // 1  점포명
  56,   // 2
  56,   // 3
  56,   // 4
  56,   // 5
  56,   // 6
  56,   // 7
  56,   // 8
  56,   // 9
  56,   // 10
  58,   // 11 행사
  58,   // 12 담배
  58,   // 13 유가증권 (72→58)
  58,   // 14 CDC (56→58)
  50,   // 15 피박스출고 (44→50)
  50,   // 16 피박스회수 (44→50)
  84,   // 17 기준시간
  216,  // 18 주소
  130,  // 19 연락처 (90→130, 소명점포 제거분)
  54,   // 20 등급
  54,   // 21 (소명점포 제거됨, colgroup 렌더링 skip)
  78,   // 22 구분
] as const;

function getReportMainCellWidth(index: number) {
  return { width: reportMainColumnWidths[index], minWidth: reportMainColumnWidths[index] };
}

const stickyCargoLeftMap = stickyCargoColumnKeys.reduce<Record<string, number>>((acc, key, index) => {
  const left = stickyCargoColumnKeys
    .slice(0, index)
    .reduce((sum, currentKey) => sum + (cargoColumns.find((column) => column.key === currentKey)?.width ?? 80), 0);
  acc[key] = left;
  return acc;
}, {});

function getStickyCargoStyle(
  key: string,
  background: string,
  isHeader = false
): React.CSSProperties {
  if (!stickyCargoColumnKeys.includes(key as (typeof stickyCargoColumnKeys)[number])) {
    return {};
  }

  return {
    position: "sticky",
    left: stickyCargoLeftMap[key],
    background,
    zIndex: isHeader ? 7 : 5,
    boxShadow: key === "store_name" ? "1px 0 0 #d6e4ee" : undefined,
  };
}

function getCargoHeaderStyle(key: string): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    background: "#f8fbfd",
    zIndex: 6,
    ...getStickyCargoStyle(key, "#f8fbfd", true),
  };
}

function getCargoGroupStyle(key: string) {
  if (["largeTotal", "large_box", "large_inner", "large_other", "large_day2l", "large_nb2l"].includes(key)) {
    return {
      background: "#f8fcff",
      borderLeft: key === "largeTotal" ? "2px solid #d7e8f5" : undefined,
      borderRight: key === "large_nb2l" ? "2px solid #d7e8f5" : undefined,
    };
  }

  if (["smallTotal", "small_low", "small_high"].includes(key)) {
    return {
      background: "#fbfcf7",
      borderLeft: key === "smallTotal" ? "2px solid #e4e8c7" : undefined,
      borderRight: key === "small_high" ? "2px solid #e4e8c7" : undefined,
    };
  }

  return {};
}

function toText(value: unknown) {
  return String(value ?? "").replace(/\r/g, " ").replace(/\n/g, " ").trim();
}

function toNumber(value: unknown) {
  const text = toText(value).replace(/,/g, "");
  if (!text) return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function formatNumber(value: unknown) {
  const num = typeof value === "number" ? value : toNumber(value);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: Number.isInteger(num) ? 0 : 2,
  }).format(num);
}

function formatPhoneNumber(value: unknown) {
  const digits = toText(value).replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return toText(value);
}

function normalizeHeader(value: unknown) {
  return toText(value).replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

function normalizeStoreName(value: unknown) {
  return toText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizePersonName(value: unknown) {
  return toText(value).replace(/\s+/g, "").toLowerCase();
}

function findHeaderIndex(headers: string[], labels: string[]) {
  for (const label of labels) {
    const index = headers.indexOf(normalizeHeader(label));
    if (index >= 0) return index;
  }
  return -1;
}

function qtyBase(row: ProductRow) {
  const assigned = row.assigned_qty || row.confirmed_qty || row.current_qty || row.original_qty || 0;
  if (assigned <= 0) return 0;
  if (row.center_unit > 0) return assigned / row.center_unit;
  return assigned;
}

function effectiveQty(row: ProductRow) {
  if (row.product_name.replace(/\s+/g, "").includes("공박스")) {
    return Math.ceil(row.assigned_qty / 5);
  }
  return qtyBase(row);
}

function cargoTotals(row: CargoRow) {
  const largeTotal = row.large_box + row.large_inner + row.large_other + row.large_day2l + row.large_nb2l;
  const smallTotal = row.small_low + row.small_high;
  return { largeTotal, smallTotal };
}

const CargoDriverInput = React.memo(function CargoDriverInput({
  value,
  onCommit,
  driverNames,
}: {
  value: string;
  onCommit: (nextValue: string) => void;
  driverNames: string[];
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = draft.trim()
    ? driverNames.filter((n) => n.includes(draft.trim()))
    : [];

  const commit = (next: string) => {
    setOpen(false);
    if (next !== value) onCommit(next);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <input
        value={draft}
        placeholder="지원기사 입력"
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (draft.trim()) setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => {
            if (draft !== value) onCommit(draft);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(draft); e.currentTarget.blur(); }
          if (e.key === "Escape") { setOpen(false); }
        }}
        style={{ width: "100%", minWidth: 120, height: 34, borderRadius: 0, border: "1px solid #d6e4ee", padding: "0 8px", outline: "none", boxSizing: "border-box" }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: 34, left: 0, zIndex: 200,
          background: "#fff", border: "1px solid #c7d6e3",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          maxHeight: 180, overflowY: "auto", minWidth: "100%",
        }}>
          {filtered.map((name) => (
            <div
              key={name}
              onMouseDown={(e) => { e.preventDefault(); setDraft(name); commit(name); }}
              style={{ padding: "7px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f0f9ff"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

function parseProductRowsFromAOA(rows: unknown[][]) {
  if (!rows.length) return [];

  const headers = (rows[0] ?? []).map((cell) => normalizeHeader(cell));
  const idx = {
    warehouse_code: findHeaderIndex(headers, ["창고코드"]),
    outbound_no: findHeaderIndex(headers, ["출고번호"]),
    outbound_detail_no: findHeaderIndex(headers, ["출고상세번호"]),
    wave_no: findHeaderIndex(headers, ["웨이브번호"]),
    wave_name: findHeaderIndex(headers, ["웨이브명"]),
    delivery_date: findHeaderIndex(headers, ["납품예정일"]),
    outbound_type: findHeaderIndex(headers, ["출고유형"]),
    assign_status: findHeaderIndex(headers, ["할당상태"]),
    delivery_round: findHeaderIndex(headers, ["배송횟수"]),
    car_no: findHeaderIndex(headers, ["호차"]),
    seq_no: findHeaderIndex(headers, ["순번"]),
    store_code: findHeaderIndex(headers, ["점포코드"]),
    store_name: findHeaderIndex(headers, ["점포명"]),
    priority_code: findHeaderIndex(headers, ["출고우선등급코드"]),
    slip_no: findHeaderIndex(headers, ["전표번호"]),
    product_code: findHeaderIndex(headers, ["상품코드"]),
    product_name: findHeaderIndex(headers, ["상품명"]),
    cell_name: findHeaderIndex(headers, ["셀", "셀명"]),
    order_unit: findHeaderIndex(headers, ["점포발주입수"]),
    original_qty: findHeaderIndex(headers, ["원주문수량"]),
    current_qty: findHeaderIndex(headers, ["현주문수량"]),
    assigned_qty: findHeaderIndex(headers, ["할당수량"]),
    picking_qty: findHeaderIndex(headers, ["피킹수량"]),
    diff_qty: findHeaderIndex(headers, ["차이수량"]),
    confirmed_qty: findHeaderIndex(headers, ["피킹확정수량"]),
    store_check_qty: findHeaderIndex(headers, ["점포검수수량"]),
    center_unit: findHeaderIndex(headers, ["센터피킹입수"]),
    outer_box_unit: findHeaderIndex(headers, ["외박스입수"]),
    work_type: findHeaderIndex(headers, ["작업구분"]),
    facility_type: findHeaderIndex(headers, ["설비유형"]),
    full_box_yn: findHeaderIndex(headers, ["풀박스작업여부"]),
    shortage_type: findHeaderIndex(headers, ["결품유형코드"]),
    shortage_reason: findHeaderIndex(headers, ["결품사유"]),
    amount: findHeaderIndex(headers, ["출고금액"]),
    outbound_condition: findHeaderIndex(headers, ["출고확정조건내역"]),
    outbound_confirm_yn: findHeaderIndex(headers, ["출고확정여부"]),
  };

  if (idx.store_code < 0 || idx.store_name < 0 || idx.product_code < 0 || idx.product_name < 0) {
    throw new Error("단품별 파일에서 필수 컬럼을 찾지 못했습니다.");
  }

  const parsed: ProductRow[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const storeCode = toText(row[idx.store_code]);
    const storeName = toText(row[idx.store_name]);
    const productCode = toText(row[idx.product_code]);
    const productName = toText(row[idx.product_name]);

    if (!storeCode && !storeName && !productCode && !productName) continue;
    if (!storeName) continue;

    parsed.push({
      warehouse_code: toText(row[idx.warehouse_code]),
      outbound_no: toText(row[idx.outbound_no]),
      outbound_detail_no: toText(row[idx.outbound_detail_no]),
      wave_no: toText(row[idx.wave_no]),
      wave_name: toText(row[idx.wave_name]),
      delivery_date: toText(row[idx.delivery_date]),
      outbound_type: toText(row[idx.outbound_type]),
      assign_status: toText(row[idx.assign_status]),
      delivery_round: toText(row[idx.delivery_round]),
      car_no: toText(row[idx.car_no]),
      seq_no: toNumber(row[idx.seq_no]),
      store_code: storeCode,
      store_name: storeName,
      priority_code: toText(row[idx.priority_code]),
      slip_no: toText(row[idx.slip_no]),
      product_code: productCode,
      product_name: productName,
      cell_name: toText(row[idx.cell_name]),
      order_unit: toNumber(row[idx.order_unit]),
      original_qty: toNumber(row[idx.original_qty]),
      current_qty: toNumber(row[idx.current_qty]),
      assigned_qty: toNumber(row[idx.assigned_qty]),
      picking_qty: toNumber(row[idx.picking_qty]),
      diff_qty: toNumber(row[idx.diff_qty]),
      confirmed_qty: toNumber(row[idx.confirmed_qty]),
      store_check_qty: toNumber(row[idx.store_check_qty]),
      center_unit: toNumber(row[idx.center_unit]),
      outer_box_unit: toNumber(row[idx.outer_box_unit]),
      work_type: toText(row[idx.work_type]),
      facility_type: toText(row[idx.facility_type]),
      full_box_yn: toText(row[idx.full_box_yn]),
      shortage_type: toText(row[idx.shortage_type]),
      shortage_reason: toText(row[idx.shortage_reason]),
      amount: toNumber(row[idx.amount]),
      outbound_condition: toText(row[idx.outbound_condition]),
      outbound_confirm_yn: toText(row[idx.outbound_confirm_yn]),
    });
  }

  return parsed;
}

async function parseWorkbookProductRows(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error("단품별 파일을 읽지 못했습니다.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  }) as unknown[][];

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    return normalized.includes(normalizeHeader("점포코드")) && normalized.includes(normalizeHeader("점포명"));
  });

  if (headerRowIndex < 0) {
    throw new Error("단품별 헤더를 찾지 못했습니다.");
  }

  return parseProductRowsFromAOA(rows.slice(headerRowIndex));
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function mergeStoreMapRows(index: Map<string, StoreMapMatch>, rows: any[]) {
  for (const row of rows ?? []) {
    const payload = {
      store_code: toText((row as any).store_code),
      store_name: toText((row as any).store_name),
      car_no: toText(row.car_no),
      seq_no: toNumber(row.seq_no),
      delivery_due_time: toText((row as any).delivery_due_time),
      address: toText((row as any).address),
    } satisfies StoreMapMatch;

    const codeKey = normalizeStoreCode((row as any).store_code);
    if (codeKey) index.set(codeKey, payload);

    const nameKey = normalizeStoreName(row.store_name);
    if (nameKey) index.set(nameKey, payload);
  }
}

async function fetchStoreMapIndexByRows(rows: Array<Pick<ProductRow | CargoRow, "store_code" | "store_name">>) {
  const index = new Map<string, StoreMapMatch>();
  const storeCodes = [...new Set(rows.map((row) => normalizeStoreCode(row.store_code)).filter(Boolean))];
  const storeNames = [
    ...new Set(
      rows
        .filter((row) => !normalizeStoreCode(row.store_code))
        .map((row) => toText(row.store_name))
        .filter(Boolean)
    ),
  ];

  for (const codes of chunkValues(storeCodes, 200)) {
    const { data, error } = await supabase
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no, delivery_due_time, address")
      .in("store_code", codes);
    if (error) throw new Error("점포 마스터를 불러오지 못했습니다.");
    mergeStoreMapRows(index, data ?? []);
  }

  for (const names of chunkValues(storeNames, 100)) {
    const { data, error } = await supabase
      .from("store_map")
      .select("store_code, store_name, car_no, seq_no, delivery_due_time, address")
      .in("store_name", names);
    if (error) throw new Error("점포 마스터를 불러오지 못했습니다.");
    mergeStoreMapRows(index, data ?? []);
  }

  return index;
}

const REPORT_SECTION_BORDER = "3px solid #111";
const REPORT_PRINT_SECTION_BORDER = "4px solid #000";
const REPORT_BODY_ROW_HEIGHT = 36;
const REPORT_NUMBER_FONT_SIZE = 14;
const REPORT_WATER_NUMBER_FONT_SIZE = 21;

function getReportSectionStyle(columnIndex: number): React.CSSProperties {
  const style: React.CSSProperties = {};

  if (columnIndex === 2 || columnIndex === 8 || columnIndex === 11) {
    style.borderLeft = REPORT_SECTION_BORDER;
  }

  if (columnIndex === 2 || columnIndex === 8 || columnIndex === 7 || columnIndex === 10 || columnIndex === 14) {
    style.borderRight = REPORT_SECTION_BORDER;
  }

  return style;
}

function getReportSectionTotalStyle(columnIndex: number): React.CSSProperties {
  const style = {
    ...getReportSectionStyle(columnIndex),
    borderBottom: columnIndex >= 2 && columnIndex <= 14 ? REPORT_SECTION_BORDER : undefined,
  } satisfies React.CSSProperties;

  return style;
}

function formatReportTotal(value: number) {
  return value === 0 ? "-" : formatNumber(value);
}

function formatReportCount(value: number) {
  return value === 0 ? "-" : formatNumber(value);
}

function applyStoreMap(rows: ProductRow[], storeMapIndex: Map<string, StoreMapMatch>) {
  let matchedCount = 0;

  const mappedRows = rows.map((row) => {
    const match = storeMapIndex.get(getStoreMapLookupKey(row.store_code, row.store_name));
    if (!match) return row;

    matchedCount += 1;
    return {
      ...row,
      car_no: match.car_no || row.car_no,
      seq_no: match.seq_no || row.seq_no,
      delivery_due_time: match.delivery_due_time || row.delivery_due_time,
      address: match.address || row.address,
    };
  });

  return { mappedRows, matchedCount };
}

function normalizeCarNo(value: unknown) {
  return toText(value).replace(/\s+/g, "");
}

function parseCarNoNumber(value: unknown) {
  const digits = normalizeCarNo(value).replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStoreCode(value: unknown) {
  const raw = toText(value);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function getStoreMapLookupKey(storeCode: unknown, storeName: unknown) {
  const normalizedCode = normalizeStoreCode(storeCode);
  return normalizedCode || normalizeStoreName(storeName);
}

function splitCarTokens(value: unknown) {
  return normalizeCarNo(value)
    .split(/[\/,|]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeDeliveryType(value: unknown) {
  const normalized = toText(value).replace(/\s+/g, "");
  if (normalized === "당일" || normalized === "전일" || normalized === "익일") return normalized;
  return "";
}

function getLegacyBatchPrintMatch(mode: "today" | "previous" | "next", carNo: number, hasUploadedCdcFile: boolean) {
  const cdcOverride = (carNo === 1823 || carNo === 1824) && hasUploadedCdcFile;

  if (mode === "today") {
    return carNo >= 1801 && carNo <= 1833 && !cdcOverride;
  }
  if (mode === "previous") {
    return (carNo >= 1844 && carNo <= 1849) || cdcOverride;
  }
  return carNo >= 1851 && carNo <= 1864;
}

async function fetchDriverProfileIndex(carNos: string[]) {
  const normalizedCarNos = [...new Set(carNos.map(normalizeCarNo).filter(Boolean))];
  if (normalizedCarNos.length === 0) return new Map<string, DriverProfile>();

  const carNoFilter = normalizedCarNos
    .flatMap((carNo) => [
      `car_no.ilike.%${carNo}%`,
      `car_no_2.ilike.%${carNo}%`,
      `car_no_3.ilike.%${carNo}%`,
      `car_no_4.ilike.%${carNo}%`,
    ])
    .join(",");
  const { data, error } = await supabase
    .from("profiles")
    .select("name,phone,car_no,car_no_2,car_no_3,car_no_4,delivery_type,delivery_type_2,delivery_type_3,delivery_type_4,vehicle_type,carrier,garage,vehicle_number")
    .ilike("work_part", "%기사%")
    .or(carNoFilter);

  if (error) throw new Error("기사 사용자마스터를 불러오지 못했습니다.");

  type DriverProfileQueryRow = {
    name?: unknown;
    phone?: unknown;
    car_no?: unknown;
    car_no_2?: unknown;
    car_no_3?: unknown;
    car_no_4?: unknown;
    delivery_type?: unknown;
    delivery_type_2?: unknown;
    delivery_type_3?: unknown;
    delivery_type_4?: unknown;
    vehicle_type?: unknown;
    carrier?: unknown;
    garage?: unknown;
    vehicle_number?: unknown;
  };

  const index = new Map<string, DriverProfile>();
  for (const row of (data ?? []) as DriverProfileQueryRow[]) {
    const primaryCarTokens = splitCarTokens(row.car_no).slice(0, 4);
    const fallbackCarTokens = [
      normalizeCarNo(row.car_no),
      normalizeCarNo(row.car_no_2),
      normalizeCarNo(row.car_no_3),
      normalizeCarNo(row.car_no_4),
    ].filter(Boolean);
    const carTokens = (primaryCarTokens.length ? primaryCarTokens : fallbackCarTokens).slice(0, 4);
    const deliveryTypes = [
      normalizeDeliveryType(row.delivery_type),
      normalizeDeliveryType(row.delivery_type_2),
      normalizeDeliveryType(row.delivery_type_3),
      normalizeDeliveryType(row.delivery_type_4),
    ];

    for (const [tokenIndex, token] of carTokens.entries()) {
      if (!normalizedCarNos.includes(token) || index.has(token)) continue;
      index.set(token, {
        name: toText(row.name),
        phone: toText(row.phone),
        car_no: token,
        delivery_type: deliveryTypes[tokenIndex] || deliveryTypes[0] || "",
        vehicle_type: toText(row.vehicle_type),
        carrier: toText(row.carrier),
        garage: toText(row.garage),
        vehicle_number: toText(row.vehicle_number),
      });
    }
  }

  return index;
}

async function fetchStoreContactIndex() {
  const { data, error } = await supabase
    .from("store_contacts")
    .select("store_name,phone");

  if (error) return new Map<string, string>();

  const index = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.store_name && row.phone && !index.has(row.store_name)) {
      index.set(row.store_name, row.phone);
    }
  }
  return index;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return raw;
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const normalizedValue = compactMatch ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}` : value;
  const date = new Date(`${normalizedValue}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

function formatExportFileDate(value: string) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(2, 8);

  const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const normalizedValue = compactMatch ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}` : value;
  const date = new Date(`${normalizedValue}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysYmd(value: string, days: number) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sumIncludedRows(rows: CargoRow[], selector: (row: CargoRow) => number, ignoreSupportExcluded = false) {
  return rows.reduce((sum, row) => sum + ((row.support_excluded && !ignoreSupportExcluded) ? 0 : selector(row)), 0);
}

function getCdcStatForRow(cdcStoreMap: Map<string, CdcStoreStat>, row: Pick<CargoRow, "store_code" | "store_name">) {
  return (
    cdcStoreMap.get(`code:${toText(row.store_code)}`) ??
    cdcStoreMap.get(`name:${normalizeStoreName(row.store_name || "")}`) ??
    null
  );
}

function getFullBoxStatForRow(fullBoxStoreMap: Map<string, CdcFullBoxStat>, row: Pick<CargoRow, "store_code" | "store_name">) {
  return (
    fullBoxStoreMap.get(`code:${toText(row.store_code)}`) ??
    fullBoxStoreMap.get(`name:${normalizeStoreName(row.store_name || "")}`) ??
    null
  );
}

function getCombinedCdcCount(
  cdcStoreMap: Map<string, CdcStoreStat>,
  fullBoxStoreMap: Map<string, CdcFullBoxStat>,
  row: Pick<CargoRow, "store_code" | "store_name">
) {
  return (
    Number(getCdcStatForRow(cdcStoreMap, row)?.maxBoxNo ?? 0) +
    Number(getFullBoxStatForRow(fullBoxStoreMap, row)?.maxBoxNo ?? 0)
  );
}

function hasCdcValueForPrint(
  cdcStoreMap: Map<string, CdcStoreStat>,
  fullBoxStoreMap: Map<string, CdcFullBoxStat>,
  group: ReportGroup
) {
  return group.rows.some((row) => getCombinedCdcCount(cdcStoreMap, fullBoxStoreMap, row) > 0);
}

function getFittedTextStyle(value: unknown, baseFontSize: number, options?: { minFontSize?: number; lineHeight?: number }) {
  const text = toText(value);
  const minFontSize = options?.minFontSize ?? Math.max(8, baseFontSize - 4);
  const lineHeight = options?.lineHeight ?? 1.2;

  let fontSize = baseFontSize;
  if (text.length >= 40) fontSize = Math.max(minFontSize, baseFontSize - 4);
  else if (text.length >= 28) fontSize = Math.max(minFontSize, baseFontSize - 3);
  else if (text.length >= 20) fontSize = Math.max(minFontSize, baseFontSize - 2);
  else if (text.length >= 14) fontSize = Math.max(minFontSize, baseFontSize - 1);

  return {
    fontSize,
    lineHeight,
    wordBreak: "break-all" as const,
    whiteSpace: "normal" as const,
  };
}

function getAddressTextStyle(value: unknown) {
  const text = toText(value);
  let fontSize = 13;

  if (text.length >= 40) fontSize = 7;
  else if (text.length >= 34) fontSize = 8;
  else if (text.length >= 29) fontSize = 9;
  else if (text.length >= 24) fontSize = 10;
  else if (text.length >= 20) fontSize = 11;
  else if (text.length >= 17) fontSize = 12;

  return {
    fontSize,
    lineHeight: 1,
    letterSpacing: fontSize <= 8 ? -0.5 : fontSize <= 10 ? -0.3 : -0.1,
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "clip" as const,
  };
}

function buildReportGroups(cargoRows: CargoRow[], driverIndex: Map<string, DriverProfile>) {
  const grouped = new Map<string, CargoRow[]>();
  for (const row of cargoRows) {
    const key = normalizeCarNo(row.car_no);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko", { numeric: true }))
    .map(([carNo, rows]) => {
      const sortedRows = [...rows].sort((a, b) => {
        if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
        return a.store_name.localeCompare(b.store_name, "ko");
      });

      const totals = sortedRows.reduce(
        (acc, row) => {
          if (row.support_excluded) return acc;
          const sum = cargoTotals(row);
          acc.large += sum.largeTotal;
          acc.small += sum.smallTotal;
          acc.event += row.event;
          acc.tobacco += row.tobacco;
          acc.certificate += row.certificate;
          acc.cdc += row.cdc;
          acc.pbox += row.pbox;
          acc.water += row.large_day2l + row.large_nb2l;
          return acc;
        },
        { large: 0, small: 0, event: 0, tobacco: 0, certificate: 0, cdc: 0, pbox: 0, water: 0 }
      );

      return {
        carNo,
        rows: sortedRows,
        driver: driverIndex.get(carNo),
        totals,
      } as ReportGroup;
    });
}

function findSupportCargoRow(cargoRows: CargoRow[], storeName: string) {
  const normalizedStoreQuery = normalizeStoreName(storeName);
  if (!normalizedStoreQuery) return null;
  return cargoRows.find((row) => normalizeStoreName(row.store_name) === normalizedStoreQuery) ?? null;
}

function buildSupportReportGroup(
  matchedRows: Array<CargoRow | null>,
  driverProfile: DriverProfile | undefined,
  driverName: string,
  storeInputs: string[]
) {
  const trimmedDriverName = driverName.trim();
  const rows = matchedRows.map((row, index) => {
    if (row) return { ...row, id: row.id || `support-${index}` };
    return {
      id: `support-${index}`,
      support_excluded: false,
      note: "",
      car_no: "",
      seq_no: 0,
      store_code: "",
      store_name: storeInputs[index] ?? "",
      large_box: 0,
      large_inner: 0,
      large_other: 0,
      large_day2l: 0,
      large_nb2l: 0,
      small_low: 0,
      small_high: 0,
      event: 0,
      tobacco: 0,
      certificate: 0,
      cdc: 0,
      pbox: 0,
      standard_time: "",
      address: "",
    } satisfies CargoRow;
  });

  const populatedRows = rows.filter((row) => row.store_code || row.store_name);
  const firstMatched = matchedRows.find((row) => Boolean(row)) ?? null;
  const totals = rows.reduce(
    (acc, row) => {
      if (!row.store_code || row.support_excluded) return acc;
      const sum = cargoTotals(row);
      acc.large += sum.largeTotal;
      acc.small += sum.smallTotal;
      acc.event += row.event;
      acc.tobacco += row.tobacco;
      acc.certificate += row.certificate;
      acc.cdc += row.cdc;
      acc.pbox += row.pbox;
      acc.water += row.large_day2l + row.large_nb2l;
      return acc;
    },
    { large: 0, small: 0, event: 0, tobacco: 0, certificate: 0, cdc: 0, pbox: 0, water: 0 }
  );

  return {
    carNo: firstMatched?.car_no ?? driverProfile?.car_no ?? "",
    rows,
    driver: driverProfile ?? {
      name: trimmedDriverName,
      phone: "",
      car_no: firstMatched?.car_no ?? "",
      vehicle_type: "",
      carrier: "",
      garage: "",
      vehicle_number: "",
    },
    supportDriverName: trimmedDriverName,
    supportStoreName: populatedRows[0]?.store_name ?? "",
    totals,
  } as ReportGroup;
}

function buildSupportReportGroups(
  cargoRows: CargoRow[],
  roundsMap: Record<string, string>,
  driverIndex: Map<string, DriverProfile>
): ReportGroup[] {
  const supportRows = cargoRows.filter((r) => r.support_excluded);
  if (!supportRows.length) return [];

  const groups = new Map<string, CargoRow[]>();
  for (const row of supportRows) {
    const driverName = row.note?.trim() ?? "";
    const round = roundsMap[row.id]?.trim() || "1";
    const key = `${driverName}|||${round}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return [...groups.entries()]
    .sort(([keyA], [keyB]) => {
      const [nameA, roundA] = keyA.split("|||");
      const [nameB, roundB] = keyB.split("|||");
      const nameDiff = nameA.localeCompare(nameB, "ko");
      if (nameDiff !== 0) return nameDiff;
      return Number(roundA) - Number(roundB);
    })
    .map(([key, rows]) => {
      const [driverName, round] = key.split("|||");
      const sortedRows = [...rows].sort((a, b) => {
        const carDiff = normalizeCarNo(a.car_no).localeCompare(normalizeCarNo(b.car_no), "ko", { numeric: true });
        if (carDiff !== 0) return carDiff;
        return a.seq_no - b.seq_no;
      });
      const totals = sortedRows.reduce(
        (acc, row) => {
          const sum = cargoTotals(row);
          acc.large += sum.largeTotal;
          acc.small += sum.smallTotal;
          acc.event += row.event;
          acc.tobacco += row.tobacco;
          acc.certificate += row.certificate;
          acc.cdc += row.cdc;
          acc.pbox += row.pbox;
          acc.water += row.large_day2l + row.large_nb2l;
          return acc;
        },
        { large: 0, small: 0, event: 0, tobacco: 0, certificate: 0, cdc: 0, pbox: 0, water: 0 }
      );
      const firstRow = sortedRows[0];
      const driver = driverName
        ? ([...driverIndex.values()].find((d) => d.name === driverName) ?? {
            name: driverName, phone: "", car_no: firstRow?.car_no ?? "",
            vehicle_type: "", carrier: "", garage: "", vehicle_number: "",
          })
        : undefined;
      return {
        carNo: firstRow?.car_no ?? "",
        rows: sortedRows,
        driver,
        supportDriverName: driverName,
        supportRound: round,
        totals,
      } as ReportGroup;
    });
}

function updateCargoByProduct(target: CargoRow, row: ProductRow) {
  const qty = effectiveQty(row);
  if (qty <= 0) return;

  const workType = row.work_type.replace(/\s+/g, "").toLowerCase();
  const productCode = row.product_code.trim();
  const productName = row.product_name.replace(/\s+/g, "").toLowerCase();

  if (productCode === "8809169711091" || productName.includes("옐로우)올데이워터생수펫2l")) {
    target.large_day2l += qty;
    return;
  }

  if (productCode === "8809482500938" || productName.includes("노브랜드)미네랄워터펫2l(qr)")) {
    target.large_nb2l += qty;
    return;
  }

  if (workType.includes("박스수기") || workType.includes("박스존1")) {
    target.large_box += qty;
    return;
  }

  if (workType.includes("이너존a")) {
    target.large_inner += qty;
    return;
  }

  if (workType.includes("이형존")) {
    target.large_other += qty;
    return;
  }

  if (workType.includes("경량존a")) {
    target.small_low += qty;
    return;
  }

  if (workType.includes("슬라존a")) {
    target.small_high += qty;
    return;
  }

  if (workType.includes("행사a")) {
    target.event += qty;
    return;
  }

  if (workType.includes("담배존") || workType.includes("담배수기")) {
    target.tobacco += qty;
    return;
  }

  if (workType.includes("유가증권")) {
    target.certificate += qty;
    return;
  }

  if (workType.includes("cdc")) {
    target.cdc += qty;
    return;
  }

  if (workType.includes("피박스")) {
    target.pbox += qty;
    return;
  }

  target.large_other += qty;
}

function buildCargoDraft(rows: ProductRow[]) {
  const grouped = new Map<string, CargoRow>();

  for (const row of rows) {
    const key = `${row.car_no}__${row.seq_no}__${row.store_name}`;
    const current =
      grouped.get(key) ??
      {
        id: key,
        support_excluded: false,
        note: "",
        car_no: row.car_no,
        seq_no: row.seq_no,
        store_code: row.store_code,
        store_name: row.store_name,
        large_box: 0,
        large_inner: 0,
        large_other: 0,
        large_day2l: 0,
        large_nb2l: 0,
        small_low: 0,
        small_high: 0,
        event: 0,
        tobacco: 0,
        certificate: 0,
        cdc: 0,
        pbox: 0,
        standard_time: row.delivery_due_time || "",
        address: row.address || "",
      };

    updateCargoByProduct(current, row);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => {
    const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
    if (carDiff !== 0) return carDiff;
    if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
    return a.store_name.localeCompare(b.store_name, "ko");
  });
}

function exportWorkbook(
  productRows: ProductRow[],
  cargoRows: CargoRow[],
  reportGroups: ReportGroup[],
  reportDate: string,
  reportFileDate: string,
  selectedReportCarNo?: string,
  storeContactIndex?: Map<string, string>
) {
  const workbook = XLSX.utils.book_new();
  const normalizedSelectedCarNo = normalizeCarNo(selectedReportCarNo ?? "");
  const targetReportGroups = normalizedSelectedCarNo
    ? reportGroups.filter((group) => normalizeCarNo(group.carNo) === normalizedSelectedCarNo)
    : reportGroups;

  const productSheetRows = [
    [
      "창고코드", "출고번호", "출고상세번호", "웨이브번호", "웨이브명", "납품예정일", "출고유형", "할당상태", "배송차수",
      "호차", "순번", "점포코드", "점포명", "출고우선등급코드", "전표번호", "상품코드", "상품명", "셀", "점포발주입수",
      "원주문수량", "현재주문수량", "할당수량", "피킹수량", "차이수량", "확정수량", "점포검수수량", "센터피킹입수",
      "외박스입수", "작업구분", "설비유형", "완박스작업여부", "결품유형코드", "결품사유", "출고금액", "출고확정조건내역", "출고확정여부",
    ],
    ...productRows.map((row) => [
      row.warehouse_code, row.outbound_no, row.outbound_detail_no, row.wave_no, row.wave_name, row.delivery_date, row.outbound_type,
      row.assign_status, row.delivery_round, row.car_no, row.seq_no, row.store_code, row.store_name, row.priority_code, row.slip_no,
      row.product_code, row.product_name, row.cell_name, row.order_unit, row.original_qty, row.current_qty, row.assigned_qty,
      row.picking_qty, row.diff_qty, row.confirmed_qty, row.store_check_qty, row.center_unit, row.outer_box_unit, row.work_type,
      row.facility_type, row.full_box_yn, row.shortage_type, row.shortage_reason, row.amount, row.outbound_condition, row.outbound_confirm_yn,
    ]),
  ];

  const cargoSheetRows: (string | number)[][] = [
    ["지원", "호차", "순번", "점포코드", "점포명", "대", "박스존", "이너존", "기타", "올데이 2L생수", "노브랜드2L생수", "소", "경량존", "슬라존", "행사", "담배", "유가증권", "비고"],
  ];

  let currentCargoCarNo = "";
  let cargoSubtotal: CargoRow & { largeTotal: number; smallTotal: number } | null = null;

  for (const row of cargoRows) {
    if (currentCargoCarNo !== row.car_no) {
      if (cargoSubtotal) {
        cargoSheetRows.push([
          "",
          currentCargoCarNo,
          "",
          "",
          `${currentCargoCarNo}호차 부분합`,
          cargoSubtotal.largeTotal,
          cargoSubtotal.large_box,
          cargoSubtotal.large_inner,
          cargoSubtotal.large_other,
          cargoSubtotal.large_day2l,
          cargoSubtotal.large_nb2l,
          cargoSubtotal.smallTotal,
          cargoSubtotal.small_low,
          cargoSubtotal.small_high,
          cargoSubtotal.event,
          cargoSubtotal.tobacco,
          cargoSubtotal.certificate,
          "",
        ]);
      }

      currentCargoCarNo = row.car_no;
      cargoSubtotal = {
        id: `subtotal-${row.car_no}`,
        support_excluded: false,
        note: "",
        car_no: row.car_no,
        seq_no: 0,
        store_code: "",
        store_name: `${row.car_no}호차 부분합`,
        large_box: 0,
        large_inner: 0,
        large_other: 0,
        large_day2l: 0,
        large_nb2l: 0,
        small_low: 0,
        small_high: 0,
        event: 0,
        tobacco: 0,
        certificate: 0,
        cdc: 0,
        pbox: 0,
        standard_time: "",
        address: "",
        largeTotal: 0,
        smallTotal: 0,
      };
    }

    const totals = cargoTotals(row);
    cargoSheetRows.push([
      row.support_excluded ? "지원" : "",
      row.car_no,
      row.seq_no,
      row.store_code,
      row.store_name,
      totals.largeTotal,
      row.large_box,
      row.large_inner,
      row.large_other,
      row.large_day2l,
      row.large_nb2l,
      totals.smallTotal,
      row.small_low,
      row.small_high,
      row.event,
      row.tobacco,
      row.certificate,
      row.note || "",
    ]);

    if (cargoSubtotal && !row.support_excluded) {
      cargoSubtotal.large_box += row.large_box;
      cargoSubtotal.large_inner += row.large_inner;
      cargoSubtotal.large_other += row.large_other;
      cargoSubtotal.large_day2l += row.large_day2l;
      cargoSubtotal.large_nb2l += row.large_nb2l;
      cargoSubtotal.small_low += row.small_low;
      cargoSubtotal.small_high += row.small_high;
      cargoSubtotal.event += row.event;
      cargoSubtotal.tobacco += row.tobacco;
      cargoSubtotal.certificate += row.certificate;
      cargoSubtotal.largeTotal += totals.largeTotal;
      cargoSubtotal.smallTotal += totals.smallTotal;
    }
  }

  if (cargoSubtotal) {
    cargoSheetRows.push([
      "",
      currentCargoCarNo,
      "",
      "",
      `${currentCargoCarNo}호차 부분합`,
      cargoSubtotal.largeTotal,
      cargoSubtotal.large_box,
      cargoSubtotal.large_inner,
      cargoSubtotal.large_other,
      cargoSubtotal.large_day2l,
      cargoSubtotal.large_nb2l,
      cargoSubtotal.smallTotal,
      cargoSubtotal.small_low,
      cargoSubtotal.small_high,
      cargoSubtotal.event,
      cargoSubtotal.tobacco,
      cargoSubtotal.certificate,
      "",
    ]);
  }

  const reportSheetRows: (string | number)[][] = [];
  const reportSheetMerges: XLSX.Range[] = [];

  for (const [groupIndex, group] of targetReportGroups.entries()) {
    const startRow = reportSheetRows.length;
    const formattedDriverPhone = formatPhoneNumber(group.driver?.phone ?? "");
    const driverLabel = group.driver?.name ? group.driver.name + (formattedDriverPhone ? ` / ${formattedDriverPhone}` : "") : "";

    reportSheetRows.push(["", "납품예정일(D+1)", reportDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "대분", group.totals.large, "점착률", "100.0%"]);
    reportSheetRows.push(["", "배송기사명", group.driver?.name ?? "", "연락처", formattedDriverPhone, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "소분", group.totals.small, "누계", "100.0%"]);
    reportSheetRows.push(["", "호차/차량번호", group.carNo, group.driver?.vehicle_number ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["", "운수사", group.driver?.carrier ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["", "차종", group.driver?.vehicle_type ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["", "차고지", group.driver?.garage ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["No", "점포명", "대", "", "", "", "", "", "소", "", "", "행사", "담배", "유가증권", "CDC", "피박스", "", "기준시간", "주소", "연락처", "전일점착(미스캔X)", ""]);
    reportSheetRows.push(["", "", "계", "박스존", "이너존", "기타", "올데이 2L생수", "노브랜드2L생수", "계", "경량존", "슬라존", "", "", "", "", "출고", "회수", "", "", "", "등급", "구분"]);

    const printableRows = [...group.rows];
    while (printableRows.length < 20) {
      printableRows.push({
        id: `blank-${group.carNo}-${printableRows.length}`,
        support_excluded: false,
        note: "",
        car_no: group.carNo,
        seq_no: 0,
        store_code: "",
        store_name: "",
        large_box: 0,
        large_inner: 0,
        large_other: 0,
        large_day2l: 0,
        large_nb2l: 0,
        small_low: 0,
        small_high: 0,
        event: 0,
        tobacco: 0,
        certificate: 0,
        cdc: 0,
        pbox: 0,
        standard_time: "",
        address: "",
      });
    }

    printableRows.slice(0, 20).forEach((row, index) => {
      const totals = cargoTotals(row);
      reportSheetRows.push([
        index + 1,
        row.store_name,
        totals.largeTotal || "",
        row.large_box || "",
        row.large_inner || "",
        row.large_other || "",
        row.large_day2l || "",
        row.large_nb2l || "",
        totals.smallTotal || "",
        row.small_low || "",
        row.small_high || "",
        row.event || "",
        row.tobacco || "",
        row.certificate || "",
        row.cdc || "",
        row.pbox || "",
        "",
        row.standard_time || "",
        row.address || "",
        row.store_name ? formatPhone(storeContactIndex?.get(row.store_name) ?? "") : "",
        "",
        "",
      ]);
    });

      reportSheetRows.push([
        "계",
        "",
        group.totals.large,
        sumIncludedRows(group.rows, (row) => row.large_box),
        sumIncludedRows(group.rows, (row) => row.large_inner),
        sumIncludedRows(group.rows, (row) => row.large_other),
        sumIncludedRows(group.rows, (row) => row.large_day2l),
        sumIncludedRows(group.rows, (row) => row.large_nb2l),
        group.totals.small,
        sumIncludedRows(group.rows, (row) => row.small_low),
        sumIncludedRows(group.rows, (row) => row.small_high),
        group.totals.event,
        group.totals.tobacco,
        group.totals.certificate,
      group.totals.cdc,
      group.totals.pbox,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    reportSheetMerges.push(
      { s: { r: startRow, c: 2 }, e: { r: startRow, c: 21 } },
      { s: { r: startRow + 1, c: 2 }, e: { r: startRow + 1, c: 21 } },
      { s: { r: startRow + 2, c: 2 }, e: { r: startRow + 2, c: 21 } },
      { s: { r: startRow + 3, c: 2 }, e: { r: startRow + 3, c: 21 } },
      { s: { r: startRow + 4, c: 2 }, e: { r: startRow + 4, c: 21 } },
      { s: { r: startRow + 5, c: 2 }, e: { r: startRow + 5, c: 21 } },
      { s: { r: startRow + 6, c: 2 }, e: { r: startRow + 6, c: 7 } },
      { s: { r: startRow + 6, c: 8 }, e: { r: startRow + 6, c: 10 } },
      { s: { r: startRow + 6, c: 15 }, e: { r: startRow + 6, c: 16 } },
      { s: { r: startRow + 6, c: 20 }, e: { r: startRow + 6, c: 22 } }
    );

    if (groupIndex < targetReportGroups.length - 1) {
      reportSheetRows.push([]);
    }
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(productSheetRows), "단품별");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cargoSheetRows), "물동량");
  XLSX.writeFile(workbook, `일일배차현황_납예${reportFileDate || "000000"}.xlsx`);
}
function cardStyle() {
  return {
    border: "1px solid #d6e4ee",
    borderRadius: 0,
    background: "#fff",
    padding: 16,
  } as const;
}

type VehicleTab = "input" | "cargo" | "report";

export function VehiclePageScreen({
  initialTab = "input",
  allowedTabs = ["input", "cargo", "report"],
  initialCarNo,
}: {
  initialTab?: VehicleTab;
  allowedTabs?: VehicleTab[];
  initialCarNo?: string;
}) {
  const INPUT_PAGE_SIZE = 50;
  const REPORT_PREVIEW_BASE_WIDTH = 1620;
  const REPORT_PRINT_SCALE_X = 0.642;
  const REPORT_PRINT_SCALE_Y = 0.662;
  const REPORT_PRINT_VERTICAL_STRETCH = REPORT_PRINT_SCALE_Y / REPORT_PRINT_SCALE_X;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reportPrintListRef = useRef<HTMLDivElement | null>(null);
  const reportPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const reportPreviewContentRef = useRef<HTMLDivElement | null>(null);
  const driverFetchKeyRef = useRef("");
  const serverSyncEnabledRef = useRef(false);
  const lastServerSnapshotRef = useRef("");
  const batchPrintRequestedRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [loadingState, setLoadingState] = useState<"" | "restore" | "upload">("restore");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [cargoRows, setCargoRows] = useState<CargoRow[]>([]);
  const [tab, setTab] = useState<VehicleTab>(initialTab);
  const [storeQueryInput, setStoreQueryInput] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [cargoQueryInput, setCargoQueryInput] = useState("");
  const [cargoQuery, setCargoQuery] = useState("");
  const [cargoStoreQueryInput, setCargoStoreQueryInput] = useState("");
  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [showSupportOnly, setShowSupportOnly] = useState(false);
  const [largeLimit, setLargeLimit] = useState("");
  const [smallLimit, setSmallLimit] = useState("");
  const [limitsMessage, setLimitsMessage] = useState("");
  const [cargoSaveBusy, setCargoSaveBusy] = useState(false);
  const [cargoDirty, setCargoDirty] = useState(false);
  const [adhesionSnapshot, setAdhesionSnapshot] = useState<AdhesionSnapshot | null>(null);
  const [cdcSnapshot, setCdcSnapshot] = useState<CdcSnapshot | null>(null);
  const [inputPage, setInputPage] = useState(1);
  const [storageReady, setStorageReady] = useState(false);
  const [driverIndex, setDriverIndex] = useState<Map<string, DriverProfile>>(new Map());
  const [storeContactIndex, setStoreContactIndex] = useState<Map<string, string>>(new Map());
  const [reportBaseRows, setReportBaseRows] = useState<CargoRow[]>([]);
  const [reportCarNoInput, setReportCarNoInput] = useState(initialCarNo ?? "");
  const [selectedReportCarNo, setSelectedReportCarNo] = useState(initialCarNo ?? "");
  const [allDriverNames, setAllDriverNames] = useState<string[]>([]);
  const [supportMode, setSupportMode] = useState(false);
  const [supportAutoMode, setSupportAutoMode] = useState(false);
  const [supportDriverNameInput, setSupportDriverNameInput] = useState("");
  const [supportStoreNameInputs, setSupportStoreNameInputs] = useState<string[]>(() => Array.from({ length: 20 }, () => ""));
  const [supportRoundsMap, setSupportRoundsMap] = useState<Record<string, string>>({});
  const [batchPrintMode, setBatchPrintMode] = useState<"" | "today" | "previous" | "next" | "all">("");
  const [reportPreviewScale, setReportPreviewScale] = useState(1);
  const [reportPreviewHeight, setReportPreviewHeight] = useState<number | null>(null);

  useEffect(() => {
    if (allowedTabs.includes(tab)) return;
    setTab(allowedTabs[0] ?? "input");
  }, [allowedTabs, tab]);

  useEffect(() => {
    void (async () => {
      try {
        setLoadingState("restore");
        const localSnapshot = await readVehicleSnapshot().catch(() => null);
        const localLimits = await readVehicleLimitsSnapshot().catch(() => null);

        if (localSnapshot) {
          setFileName(localSnapshot.fileName ?? "");
          setProductRows(Array.isArray(localSnapshot.productRows) ? localSnapshot.productRows : []);
          setCargoRows(Array.isArray(localSnapshot.cargoRows) ? localSnapshot.cargoRows : []);
          setCargoDirty(false);
          lastServerSnapshotRef.current = JSON.stringify({
            fileName: localSnapshot.fileName ?? "",
            cargoRows: Array.isArray(localSnapshot.cargoRows) ? localSnapshot.cargoRows : [],
          });
        }

        if (localLimits) {
          setLargeLimit(localLimits.largeLimit ? String(localLimits.largeLimit) : "");
          setSmallLimit(localLimits.smallLimit ? String(localLimits.smallLimit) : "");
        }

        setLoadingState("");
        setStorageReady(true);

        const serverSaved = await fetchServerVehicleSnapshot().catch((error) => {
          setMessage((error as Error)?.message ?? "서버 저장 데이터를 불러오지 못했습니다.");
          return null;
        });
        if (serverSaved) {
          serverSyncEnabledRef.current = true;
          setReportBaseRows(Array.isArray(serverSaved.reportBaseRows) ? serverSaved.reportBaseRows : []);
        }

        if (serverSaved?.snapshot) {
          const nextSnapshot = serverSaved.snapshot;
          setFileName(nextSnapshot.fileName ?? "");
          setProductRows(Array.isArray(nextSnapshot.productRows) ? nextSnapshot.productRows : []);
          setCargoRows(Array.isArray(nextSnapshot.cargoRows) ? nextSnapshot.cargoRows : []);
          setCargoDirty(false);
          lastServerSnapshotRef.current = JSON.stringify({
            fileName: nextSnapshot.fileName ?? "",
            cargoRows: Array.isArray(nextSnapshot.cargoRows) ? nextSnapshot.cargoRows : [],
          });
          void writeVehicleSnapshot(nextSnapshot).catch(() => {});
        }

        if (serverSaved?.limits) {
          const nextLimits = serverSaved.limits;
          setLargeLimit(nextLimits.largeLimit ? String(nextLimits.largeLimit) : "");
          setSmallLimit(nextLimits.smallLimit ? String(nextLimits.smallLimit) : "");
          void writeVehicleLimitsSnapshot(nextLimits).catch(() => {});
        }
      } finally {
        setLoadingState("");
        setStorageReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const saved = await fetchVehicleAdhesionSnapshot();
        setAdhesionSnapshot(saved);
      } catch {
        setAdhesionSnapshot(null);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const saved = await fetchVehicleCdcSnapshot();
        setCdcSnapshot(saved);
      } catch {
        setCdcSnapshot(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const snapshot = {
      fileName,
      productRows,
      cargoRows,
    };

    void writeVehicleSnapshot(snapshot).catch(() => {});
  }, [fileName, productRows, cargoRows, storageReady]);

  useEffect(() => {
    if (!storageReady || cargoRows.length === 0) return;

    let cancelled = false;
    void fetchStoreMapIndexByRows(cargoRows)
      .then((storeMapIndex) => {
        if (cancelled) return;

        setCargoRows((prev) => {
          let changed = false;
          const next = prev.map((row) => {
            const match = storeMapIndex.get(getStoreMapLookupKey(row.store_code, row.store_name));
            if (!match) return row;

            const standard_time = row.standard_time || match.delivery_due_time;
            const address = row.address || match.address;
            if (standard_time === row.standard_time && address === row.address) return row;

            changed = true;
            return { ...row, standard_time, address };
          });

          return changed ? next : prev;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [storageReady, cargoRows.length]);

  useEffect(() => {
    if (tab !== "cargo") return;
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("name")
          .ilike("work_part", "%기사%");
        const names = (data ?? [])
          .map((r) => toText((r as Record<string, unknown>).name))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "ko"));
        setAllDriverNames(names);
      } catch {}
    })();
  }, [tab]);

  const reportSourceRows = useMemo(() => (cargoRows.length > 0 ? cargoRows : reportBaseRows), [cargoRows, reportBaseRows]);

  useEffect(() => {
    if (tab !== "report") return;
    const carNos = [...new Set(reportSourceRows.map((row) => normalizeCarNo(row.car_no)).filter(Boolean))];
    if (carNos.length === 0) {
      driverFetchKeyRef.current = "";
      setDriverIndex(new Map());
      return;
    }

    const nextKey = carNos.join("|");
    if (driverFetchKeyRef.current === nextKey) return;
    driverFetchKeyRef.current = nextKey;

    void fetchDriverProfileIndex(carNos)
      .then((result) => setDriverIndex(result))
      .catch(() => setDriverIndex(new Map()));
  }, [reportSourceRows, tab]);

  useEffect(() => {
    if (tab !== "report") return;
    void fetchStoreContactIndex()
      .then((result) => setStoreContactIndex(result))
      .catch(() => setStoreContactIndex(new Map()));
  }, [tab]);

  const totals = useMemo(
    () =>
      cargoRows.reduce(
        (acc, row) => {
          const sum = cargoTotals(row);
          acc.stores += 1;
          acc.large += sum.largeTotal;
          acc.small += sum.smallTotal;
          acc.tobacco += row.tobacco;
          acc.water += row.large_day2l + row.large_nb2l;
          return acc;
        },
        { stores: 0, large: 0, small: 0, tobacco: 0, water: 0 }
      ),
    [cargoRows]
  );

  const reportDate = useMemo(() => {
    const baseDate = productRows.find((row) => row.delivery_date)?.delivery_date ?? "";
    return formatDisplayDate(baseDate);
  }, [productRows]);

  const reportFileDate = useMemo(() => {
    const baseDate = productRows.find((row) => row.delivery_date)?.delivery_date ?? "";
    return formatExportFileDate(baseDate);
  }, [productRows]);

  const reportGroups = useMemo(() => buildReportGroups(reportSourceRows, driverIndex), [reportSourceRows, driverIndex]);
  const adhesionDriverMap = useMemo(() => {
    const map = new Map<string, AdhesionDriverStat>();
    for (const row of adhesionSnapshot?.driverStats ?? []) {
      const key = normalizePersonName(row.name);
      if (key) map.set(key, row);
    }
    return map;
  }, [adhesionSnapshot]);

  const adhesionStoreMap = useMemo(() => {
    const map = new Map<string, AdhesionStoreStat>();
    for (const row of adhesionSnapshot?.storeStats ?? []) {
      const key = normalizeStoreName(row.storeName);
      if (key) map.set(key, row);
    }
    return map;
  }, [adhesionSnapshot]);

  const cdcStoreMap = useMemo(() => {
    const map = new Map<string, CdcStoreStat>();
    for (const row of cdcSnapshot?.rows ?? []) {
      const codeKey = toText(row.storeCode);
      const nameKey = normalizeStoreName(row.storeName);
      if (codeKey) map.set(`code:${codeKey}`, row);
      if (nameKey) map.set(`name:${nameKey}`, row);
    }
    return map;
  }, [cdcSnapshot]);

  const fullBoxStoreMap = useMemo(() => {
    const map = new Map<string, CdcFullBoxStat>();
    for (const row of cdcSnapshot?.fullBoxRows ?? []) {
      const codeKey = toText(row.storeCode);
      const nameKey = normalizeStoreName(row.storeName);
      if (codeKey) map.set(`code:${codeKey}`, row);
      if (nameKey) map.set(`name:${nameKey}`, row);
    }
    return map;
  }, [cdcSnapshot]);

  const selectedReportGroup = useMemo(() => {
    if (reportGroups.length === 0) return null;
    return reportGroups.find((group) => normalizeCarNo(group.carNo) === normalizeCarNo(selectedReportCarNo)) ?? reportGroups[0];
  }, [reportGroups, selectedReportCarNo]);
  const supportMatchedRows = useMemo(
    () => supportStoreNameInputs.map((storeName) => findSupportCargoRow(cargoRows, storeName)),
    [cargoRows, supportStoreNameInputs]
  );
  const supportDriverProfile = useMemo(() => {
    const normalizedName = normalizePersonName(supportDriverNameInput);
    if (!normalizedName) return undefined;
    return [...driverIndex.values()].find((driver) => normalizePersonName(driver.name) === normalizedName);
  }, [driverIndex, supportDriverNameInput]);
  const supportReportGroup = useMemo(
    () => (supportMode ? buildSupportReportGroup(supportMatchedRows, supportDriverProfile, supportDriverNameInput, supportStoreNameInputs) : null),
    [supportDriverNameInput, supportDriverProfile, supportMatchedRows, supportMode, supportStoreNameInputs]
  );
  const supportReportGroups = useMemo(
    () => (supportMode ? buildSupportReportGroups(cargoRows, supportRoundsMap, driverIndex) : []),
    [supportMode, cargoRows, supportRoundsMap, driverIndex]
  );
  const updateSupportStoreNameInput = (index: number, value: string) => {
    setSupportStoreNameInputs((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };
  const activeReportGroup = (supportMode && supportAutoMode ? supportReportGroups[0] : supportMode ? supportReportGroup : null) ?? selectedReportGroup;
  const visibleReportGroups = useMemo(() => {
    // 당일/전일/익일/전체 출력은 지원모드 무관하게 무조건 일반 출력
    if (batchPrintMode) {
      if (batchPrintMode === "all") return reportGroups;
      const hasUploadedCdcFile = Boolean(cdcSnapshot?.fileName);
      return reportGroups.filter((group) => {
        const carNo = parseCarNoNumber(group.carNo);
        const deliveryType = normalizeDeliveryType(group.driver?.delivery_type);
        if (deliveryType) {
          if (batchPrintMode === "today") return deliveryType === "당일";
          if (batchPrintMode === "previous") return deliveryType === "전일";
          if (batchPrintMode === "next") return deliveryType === "익일";
        }
        return getLegacyBatchPrintMatch(batchPrintMode, carNo, hasUploadedCdcFile);
      });
    }
    if (supportMode && supportAutoMode) return supportReportGroups;
    return activeReportGroup ? [activeReportGroup] : [];
  }, [supportMode, supportAutoMode, supportReportGroups, activeReportGroup, batchPrintMode, reportGroups, cdcSnapshot?.fileName]);

  useEffect(() => {
    if (!batchPrintMode || !batchPrintRequestedRef.current) return;

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        batchPrintRequestedRef.current = false;
        void printVisibleReportPages(() => setBatchPrintMode(""));
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [batchPrintMode, visibleReportGroups]);

  const filteredProductRows = useMemo(() => {
    const query = normalizeStoreName(storeQuery);
    const rows = query
      ? productRows.filter((row) => {
          const targets = [
            row.car_no,
            row.store_code,
            row.store_name,
            row.cell_name,
            row.product_code,
            row.product_name,
          ].map((value) => normalizeStoreName(value));

          return targets.some((value) => value.includes(query));
        })
      : productRows;

    return [...rows].sort((a, b) => {
      const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
      if (carDiff !== 0) return carDiff;

      if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;

      const storeDiff = a.store_name.localeCompare(b.store_name, "ko");
      if (storeDiff !== 0) return storeDiff;

      return a.cell_name.localeCompare(b.cell_name, "ko", { numeric: true });
    });
  }, [productRows, storeQuery]);

  const filteredCargoRows = useMemo(() => {
    const carQ = normalizeStoreName(cargoQuery);
    const storeQ = normalizeStoreName(storeSearchQuery);
    let rows = cargoRows;
    if (showSupportOnly) rows = rows.filter((row) => row.support_excluded);
    if (carQ) rows = rows.filter((row) => normalizeStoreName(row.car_no).includes(carQ));
    if (storeQ) rows = rows.filter((row) => normalizeStoreName(row.store_code).includes(storeQ) || normalizeStoreName(row.store_name).includes(storeQ));

    return [...rows].sort((a, b) => {
      const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
      if (carDiff !== 0) return carDiff;
      if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
      return a.store_name.localeCompare(b.store_name, "ko");
    });
  }, [cargoRows, cargoQuery, storeSearchQuery, showSupportOnly]);

  const inputPageCount = Math.max(1, Math.ceil(filteredProductRows.length / INPUT_PAGE_SIZE));

  const pagedProductRows = useMemo(() => {
    const start = (inputPage - 1) * INPUT_PAGE_SIZE;
    return filteredProductRows.slice(start, start + INPUT_PAGE_SIZE);
  }, [filteredProductRows, inputPage]);

  useEffect(() => {
    setInputPage(1);
  }, [storeQuery, fileName]);

  useEffect(() => {
    if (inputPage > inputPageCount) {
      setInputPage(inputPageCount);
    }
  }, [inputPage, inputPageCount]);

  useEffect(() => {
    if (reportGroups.length === 0) {
      setReportCarNoInput("");
      setSelectedReportCarNo("");
      return;
    }

    const hasMatchingGroup = reportGroups.some((group) => normalizeCarNo(group.carNo) === normalizeCarNo(selectedReportCarNo));
    if (!selectedReportCarNo || !hasMatchingGroup) {
      setReportCarNoInput(reportGroups[0].carNo);
      setSelectedReportCarNo(reportGroups[0].carNo);
    }
  }, [reportGroups, selectedReportCarNo]);

  useEffect(() => {
    const updatePreviewScale = () => {
      const containerWidth = reportPreviewContainerRef.current?.clientWidth ?? 0;
      if (!containerWidth) return;

      const nextScale = Math.max(0.72, Math.min(1, containerWidth / REPORT_PREVIEW_BASE_WIDTH));
      setReportPreviewScale(Number(nextScale.toFixed(3)));
    };

    updatePreviewScale();

    const observer = typeof ResizeObserver !== "undefined" && reportPreviewContainerRef.current
      ? new ResizeObserver(() => updatePreviewScale())
      : null;

    if (observer && reportPreviewContainerRef.current) {
      observer.observe(reportPreviewContainerRef.current);
    }

    window.addEventListener("resize", updatePreviewScale);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
    };
  }, [REPORT_PREVIEW_BASE_WIDTH]);

  useEffect(() => {
    const contentHeight = reportPreviewContentRef.current?.offsetHeight ?? 0;
    if (!contentHeight) return;
    setReportPreviewHeight(Math.ceil(contentHeight * reportPreviewScale));
  }, [reportPreviewScale, activeReportGroup, reportDate]);

  const loadRows = async (file: File) => {
    setBusy(true);
    setLoadingState("upload");
    setMessage("");

    try {
      const { snapshot, matchedCount } = await uploadVehicleFileToServer(file);
      const mappedRows = Array.isArray(snapshot.productRows) ? snapshot.productRows : [];
      const draft = Array.isArray(snapshot.cargoRows) ? snapshot.cargoRows : [];
      serverSyncEnabledRef.current = true;
      lastServerSnapshotRef.current = JSON.stringify({
        fileName: snapshot.fileName || file.name,
        cargoRows: draft,
      });

      setProductRows(mappedRows);
      setCargoRows(draft);
      setFileName(snapshot.fileName || file.name);
      setStoreQuery("");
      setStoreQueryInput("");
      setCargoQuery("");
      setCargoQueryInput("");
      setInputPage(1);
      setTab("cargo");
      setCargoDirty(false);
      setMessage(`서버 저장 완료: 점포명 기준 ${matchedCount}건 매칭, 단품별 ${mappedRows.length}건 / 물동량 ${draft.length}개 점포 초안 생성 완료`);
    } catch (error: any) {
      setProductRows([]);
      setCargoRows([]);
      setMessage(error?.message ?? "불러오기 실패");
    } finally {
      setLoadingState("");
      setBusy(false);
    }
  };

  const updateCargoRow = (index: number, key: keyof CargoRow, value: string) => {
    setCargoDirty(true);
    setCargoRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (key === "note") return { ...row, [key]: value };
        if (key === "car_no" || key === "store_code" || key === "store_name") return { ...row, [key]: value };
        return { ...row, [key]: toNumber(value) } as CargoRow;
      })
    );
  };

  const toggleCargoSupport = (index: number, checked: boolean) => {
    setCargoDirty(true);
    setCargoRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, support_excluded: checked } : row))
    );
  };

  const saveCargoSettings = async () => {
    if (!serverSyncEnabledRef.current || !fileName || cargoRows.length === 0) {
      setMessage("먼저 단품별 파일을 업로드해 주세요.");
      return;
    }

    setCargoSaveBusy(true);
    setMessage("");

    try {
      await saveServerVehicleSnapshot(fileName, productRows, cargoRows);
      lastServerSnapshotRef.current = JSON.stringify({ fileName, cargoRows });
      setCargoDirty(false);
      setMessage("물동량 지원표시와 수정값을 서버에 저장했습니다.");
    } catch (error: any) {
      setMessage(error?.message ?? "물동량 저장 실패");
    } finally {
      setCargoSaveBusy(false);
    }
  };

  const cargoDisplayRows = useMemo(() => {
    const rows: Array<
      | { kind: "item"; row: CargoRow; sourceIndex: number }
      | { kind: "subtotal"; carNo: string; total: CargoRow & { largeTotal: number; smallTotal: number } }
    > = [];

    let currentCarNo = "";
    let subtotal: (CargoRow & { largeTotal: number; smallTotal: number }) | null = null;

    for (const row of filteredCargoRows) {
      if (currentCarNo !== row.car_no) {
        if (subtotal) {
          rows.push({ kind: "subtotal", carNo: currentCarNo, total: subtotal });
        }

        currentCarNo = row.car_no;
        subtotal = {
          id: `subtotal-${row.car_no}`,
          car_no: row.car_no,
          seq_no: 0,
          store_code: "",
          store_name: `${row.car_no}호차 부분합`,
          large_box: 0,
          large_inner: 0,
          large_other: 0,
          large_day2l: 0,
          large_nb2l: 0,
          small_low: 0,
          small_high: 0,
          event: 0,
          tobacco: 0,
          certificate: 0,
          cdc: 0,
          pbox: 0,
          standard_time: "",
          address: "",
          largeTotal: 0,
          smallTotal: 0,
        };
      }

      const sourceIndex = cargoRows.findIndex((item) => item.id === row.id);
      rows.push({ kind: "item", row, sourceIndex });

      if (subtotal && !row.support_excluded) {
        const totals = cargoTotals(row);
        subtotal.large_box += row.large_box;
        subtotal.large_inner += row.large_inner;
        subtotal.large_other += row.large_other;
        subtotal.large_day2l += row.large_day2l;
        subtotal.large_nb2l += row.large_nb2l;
        subtotal.small_low += row.small_low;
        subtotal.small_high += row.small_high;
        subtotal.event += row.event;
        subtotal.tobacco += row.tobacco;
        subtotal.certificate += row.certificate;
        subtotal.largeTotal += totals.largeTotal;
        subtotal.smallTotal += totals.smallTotal;
      }
    }

    if (subtotal) {
      rows.push({ kind: "subtotal", carNo: currentCarNo, total: subtotal });
    }

    return rows;
  }, [filteredCargoRows, cargoRows]);

  const resetStoredData = () => {
    setFileName("");
    setMessage("");
    setProductRows([]);
    setCargoRows([]);
    setStoreQuery("");
    setStoreQueryInput("");
    setCargoQuery("");
    setCargoQueryInput("");
    setInputPage(1);
    setTab("input");
    setCargoDirty(false);
    lastServerSnapshotRef.current = "";
    void clearServerVehicleSnapshot().catch(() => {});
    void clearVehicleSnapshot().catch(() => {});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveLimitSettings = () => {
    void writeVehicleLimitsSnapshot({
      largeLimit: Number(largeLimit || 0),
      smallLimit: Number(smallLimit || 0),
    })
      .then(async () => {
        await saveServerVehicleLimits({
          largeLimit: Number(largeLimit || 0),
          smallLimit: Number(smallLimit || 0),
        });
        setLimitsMessage("기준값 저장됨");
      })
      .catch(() => setLimitsMessage("기준값 저장 실패"));
  };

  const printVisibleReportPages = async (onAfterPrint?: () => void) => {
    const source = reportPrintListRef.current;
    if (!source) {
      setMessage("출력 영역을 찾지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
      onAfterPrint?.();
      return;
    }

    const shells = Array.from(source.querySelectorAll(".report-print-shell"));
    if (!shells.length) {
      setMessage("출력할 운행일보가 없습니다.");
      onAfterPrint?.();
      return;
    }

    const printMarkup = shells
      .map((shell) => {
        const clone = shell.cloneNode(true) as HTMLDivElement;

        clone.querySelectorAll("input").forEach((inputNode) => {
          const input = inputNode as HTMLInputElement;
          const replacement = document.createElement("span");
          replacement.textContent = input.value;
          replacement.style.display = "block";
          replacement.style.width = "100%";
          replacement.style.minHeight = "24px";
          replacement.style.lineHeight = "24px";
          replacement.style.textAlign = input.style.textAlign || "center";
          replacement.style.fontWeight = input.style.fontWeight || "800";
          replacement.style.fontSize = input.style.fontSize || "13px";
          replacement.style.color = input.style.color || "#111827";
          input.replaceWith(replacement);
        });

        clone.querySelectorAll(".report-preview-viewport").forEach((node) => {
          const viewport = node as HTMLDivElement;
          viewport.style.minHeight = "";
          viewport.style.height = "";
          viewport.style.overflow = "visible";
        });

        clone.querySelectorAll(".report-print-frame").forEach((node) => {
          const frame = node as HTMLDivElement;
          frame.style.transform = `scaleY(${REPORT_PRINT_VERTICAL_STRETCH})`;
          frame.style.transformOrigin = "top left";
          frame.style.zoom = String(REPORT_PRINT_SCALE_X);
          frame.style.width = `${REPORT_PREVIEW_BASE_WIDTH}px`;
        });

        clone.querySelectorAll("*").forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.style.setProperty("-webkit-print-color-adjust", "exact");
          node.style.setProperty("print-color-adjust", "exact");
        });

        return clone.outerHTML;
      })
      .join("");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
        onAfterPrint?.();
      }, 0);
    };

    const printWindow = iframe.contentWindow;
    const doc = printWindow?.document;
    if (!doc || !printWindow) {
      cleanup();
      setMessage("출력 창을 열지 못했습니다. 브라우저 설정을 확인해 주세요.");
      return;
    }

    doc.open();
    doc.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>운행일보 출력</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 0;
            }

            html, body {
              width: 297mm;
              min-height: 210mm;
              margin: 0;
              padding: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, "Segoe UI", sans-serif;
              line-height: 1;
            }

            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body {
              min-width: 297mm;
              overflow: visible;
            }

            .print-root {
              width: 297mm;
              min-height: 210mm;
              height: auto;
              overflow: visible;
            }

            .report-print-shell {
              position: relative;
              width: 297mm;
              height: 210mm;
              min-height: 210mm;
              margin: 0;
              border: 0 !important;
              overflow: hidden;
              background: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              padding-left: 10mm !important;
              box-sizing: border-box;
              break-after: page;
              page-break-after: always;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .report-print-shell:last-child {
              break-after: auto;
              page-break-after: auto;
            }

            .report-preview-viewport {
              width: 100% !important;
              overflow: visible !important;
              min-height: auto !important;
              height: auto !important;
            }

            .report-print-frame {
              width: ${REPORT_PREVIEW_BASE_WIDTH}px !important;
              zoom: ${REPORT_PRINT_SCALE_X} !important;
              transform: scaleY(${REPORT_PRINT_VERTICAL_STRETCH}) !important;
              transform-origin: top left !important;
            }

            .report-print-frame table {
              border-collapse: collapse !important;
            }

            .report-print-frame table:nth-of-type(2) thead th {
              padding-top: 5px !important;
              padding-bottom: 5px !important;
              font-size: 12px !important;
              line-height: 1.15 !important;
            }

            .report-print-frame table:nth-of-type(2) tbody tr {
              height: 31px !important;
              min-height: 31px !important;
              max-height: 31px !important;
              line-height: 1 !important;
            }

            .report-print-frame table:nth-of-type(2) tbody td {
              height: 31px !important;
              min-height: 31px !important;
              max-height: 31px !important;
              padding-top: 3px !important;
              padding-bottom: 3px !important;
              line-height: 1 !important;
            }

            .report-print-frame table:nth-of-type(2) tbody td[style*="font-size: 16px"] {
              font-size: 15px !important;
            }

            .report-print-frame table:nth-of-type(2) tbody td[style*="font-size: 14px"] {
              font-size: 13px !important;
            }

            .report-print-frame table:nth-of-type(2) tbody td[style*="font-size: 13px"] {
              font-size: 12px !important;
            }

            .report-print-frame input,
            .report-print-frame span {
              line-height: 1 !important;
            }

            .report-print-frame .report-section-top {
              border-top: ${REPORT_PRINT_SECTION_BORDER} !important;
              box-shadow: none !important;
            }

            .report-print-frame .report-section-left {
              border-left: ${REPORT_PRINT_SECTION_BORDER} !important;
              box-shadow: none !important;
            }

            .report-print-frame .report-section-right {
              border-right: ${REPORT_PRINT_SECTION_BORDER} !important;
              box-shadow: none !important;
            }

            .report-print-frame .report-section-bottom {
              border-bottom: ${REPORT_PRINT_SECTION_BORDER} !important;
              box-shadow: none !important;
            }
          </style>
        </head>
        <body>
          <div class="print-root">${printMarkup}</div>
        </body>
      </html>
    `);
    doc.close();

    let cleanedUp = false;
    const finalize = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      cleanup();
    };

    printWindow.onafterprint = finalize;
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        finalize();
        setMessage("출력을 시작하지 못했습니다. 다시 시도해 주세요.");
      }
    }, 150);
  };

  const printSelectedReport = () => {
    if (!activeReportGroup) return;
    setBatchPrintMode("");
    window.setTimeout(() => {
      void printVisibleReportPages();
    }, 0);
  };

  const printAllReports = (mode: "today" | "previous" | "next" | "all") => {
    if (reportGroups.length === 0) return;
    batchPrintRequestedRef.current = true;
    setBatchPrintMode(mode);
  };

  const topCardStyle = cardStyle();

  return (
    <div style={{ display: "grid", gap: 16 }} className="vehicle-page">
      <style jsx global>{`
        @keyframes vehicle-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @page {
          size: A4 landscape;
          margin: 0;
        }

        @media print {
          html, body {
            width: 297mm;
            height: 210mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .ha-admin-header {
            display: none !important;
          }

          .ha-admin-content {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .vehicle-page {
            display: block !important;
            gap: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .vehicle-page > * {
            display: none !important;
          }

          .vehicle-page > .report-print-list {
            display: block !important;
          }

          .report-print-list > :not(.report-print-shell) {
            display: none !important;
          }

          .report-print-shell {
            position: relative !important;
            width: 297mm;
            height: 210mm;
            min-height: 210mm;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
            background: #fff !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding-left: 10mm !important;
            box-sizing: border-box !important;
            break-after: page !important;
            page-break-after: always !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .report-print-shell:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .report-preview-viewport {
            width: 100% !important;
            overflow: visible !important;
            min-height: auto !important;
            height: auto !important;
          }

          .report-print-frame {
            width: ${REPORT_PREVIEW_BASE_WIDTH}px !important;
            zoom: ${REPORT_PRINT_SCALE_X} !important;
            transform: scaleY(${REPORT_PRINT_VERTICAL_STRETCH}) !important;
            transform-origin: top left !important;
          }

          .report-print-frame .report-section-top {
            border-top: ${REPORT_PRINT_SECTION_BORDER} !important;
            box-shadow: none !important;
          }

          .report-print-frame .report-section-left {
            border-left: ${REPORT_PRINT_SECTION_BORDER} !important;
            box-shadow: none !important;
          }

          .report-print-frame .report-section-right {
            border-right: ${REPORT_PRINT_SECTION_BORDER} !important;
            box-shadow: none !important;
          }

          .report-print-frame .report-section-bottom {
            border-bottom: ${REPORT_PRINT_SECTION_BORDER} !important;
            box-shadow: none !important;
          }


          .report-screen-only {
            display: none !important;
          }
        }
      `}</style>
      <div
        className="report-screen-only"
        style={{
          border: "1px solid #c7d6e3",
          borderRadius: 0,
          padding: 20,
          background: "linear-gradient(180deg, #fbfeff 0%, #f2f8fb 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 950, color: "#0f2940", letterSpacing: -0.5 }}>차량</div>
            <div style={{ marginTop: 8, color: "#486274", lineHeight: 1.6, fontSize: 14 }}>
              단품별 파일을 올리면 점포명 기준으로 점포마스터의 호차와 순번을 먼저 반영한 뒤 물동량과 운행일보를 만듭니다.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {allowedTabs.includes("input") ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #0f766e",
                background: "#0f766e",
                color: "#fff",
                fontWeight: 900,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "불러오는 중..." : "단품별 파일 불러오기"}
            </button>
            ) : null}
            <button
              onClick={() => exportWorkbook(productRows, cargoRows, reportGroups, reportDate, reportFileDate, selectedReportGroup?.carNo, storeContactIndex)}
              disabled={cargoRows.length === 0}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #113247",
                background: cargoRows.length === 0 ? "#cbd5e1" : "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: cargoRows.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              운행일보 다운로드
            </button>
            <button
              onClick={resetStoredData}
              disabled={productRows.length === 0 && cargoRows.length === 0}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                background: productRows.length === 0 && cargoRows.length === 0 ? "#eef3f7" : "#fff",
                color: "#28485d",
                fontWeight: 900,
                cursor: productRows.length === 0 && cargoRows.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              초기화
            </button>
            {allowedTabs.includes("input") ? (
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsb,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void loadRows(file);
              }}
            />
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 12, color: "#29485e", fontSize: 13, fontWeight: 700 }}>
          {fileName ? `현재 데이터: ${fileName}` : "단품별 파일만 올리면 됩니다."}
        </div>
        {loadingState ? (
          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 0,
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: "2px solid rgba(29,78,216,0.25)",
                borderTopColor: "#1d4ed8",
                display: "inline-block",
                animation: "vehicle-spin 0.8s linear infinite",
              }}
            />
            {loadingState === "restore" ? "서버 저장 데이터를 불러오는 중입니다..." : "파일을 서버에 업로드하고 정리하는 중입니다..."}
          </div>
        ) : null}
        {message ? <div style={{ marginTop: 8, color: "#103b53", fontSize: 13, fontWeight: 700 }}>{message}</div> : null}
      </div>

      <div className="report-screen-only" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {[
          { label: "발주점포수", value: formatNumber(totals.stores) },
          { label: "대 물동량", value: formatNumber(totals.large) },
          { label: "소 물동량", value: formatNumber(totals.small) },
          { label: "담배", value: formatNumber(totals.tobacco) },
          { label: "대생수", value: formatNumber(totals.water) },
        ].map((card) => (
          <div key={card.label} style={topCardStyle}>
            <div style={{ fontSize: 12, color: "#678092", fontWeight: 800 }}>{card.label}</div>
            <div style={{ marginTop: 8, fontSize: 24, color: "#102f46", fontWeight: 950 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {allowedTabs.length > 1 ? (
      <div className="report-screen-only" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          ["input", "단품별"],
          ["cargo", "물동량"],
          ["report", "운행일보"],
        ]
          .filter(([key]) => allowedTabs.includes(key as VehicleTab))
          .map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key as VehicleTab)}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 4,
                border: active ? "1px solid #0f766e" : "1px solid #d6e4ee",
                background: active ? "#e7f6f2" : "#fff",
                color: active ? "#0f5e57" : "#28485d",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      ) : null}

      {tab === "input" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={storeQueryInput}
              onChange={(event) => setStoreQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                setStoreQuery(storeQueryInput);
                setInputPage(1);
              }}
              placeholder="호차, 점포코드, 점포명, 셀, 상품코드 검색"
              style={{
                width: 280,
                height: 42,
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                padding: "0 14px",
                outline: "none",
                background: "#fff",
              }}
            />
            <button
              onClick={() => {
                setStoreQuery(storeQueryInput);
                setInputPage(1);
              }}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #113247",
                background: "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              조회
            </button>
            <button
              onClick={() => {
                setStoreQueryInput("");
                setStoreQuery("");
                setInputPage(1);
              }}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                background: "#fff",
                color: "#28485d",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              전체
            </button>
            <div style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>
              {storeQuery ? `검색 결과 ${filteredProductRows.length}건` : `전체 ${filteredProductRows.length}건`}
            </div>
          </div>

          <div style={{ border: "1px solid #d6e4ee", borderRadius: 0, background: "#fff", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fbfd" }}>
                  {["호차", "순번", "점포코드", "점포명", "작업구분", "셀", "상품코드", "상품명", "출고수량", "출고배수"].map((header) => (
                    <th key={header} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e6eef4", fontSize: 13 }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedProductRows.map((row, index) => (
                  <tr key={`${row.store_name}-${row.product_code}-${index}`} style={{ background: index % 2 === 0 ? "#fff" : "#fbfdff" }}>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.car_no}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.seq_no}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.store_code}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.store_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.work_type}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.cell_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.product_code}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{row.product_name}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{formatNumber(row.assigned_qty)}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{formatNumber(effectiveQty(row))}</td>
                  </tr>
                ))}
                {pagedProductRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 18, color: "#6b7280" }}>
                      {productRows.length === 0 ? "아직 불러온 단품별 데이터가 없습니다." : "검색된 점포 발주현황이 없습니다."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {filteredProductRows.length > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>
                {inputPage} / {inputPageCount} 페이지
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setInputPage(1)}
                  disabled={inputPage === 1}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 0,
                    border: "1px solid #c7d6e3",
                    background: inputPage === 1 ? "#eef3f7" : "#fff",
                    color: "#28485d",
                    fontWeight: 800,
                    cursor: inputPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  처음
                </button>
                <button
                  onClick={() => setInputPage((prev) => Math.max(1, prev - 1))}
                  disabled={inputPage === 1}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 0,
                    border: "1px solid #c7d6e3",
                    background: inputPage === 1 ? "#eef3f7" : "#fff",
                    color: "#28485d",
                    fontWeight: 800,
                    cursor: inputPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  이전
                </button>
                <button
                  onClick={() => setInputPage((prev) => Math.min(inputPageCount, prev + 1))}
                  disabled={inputPage === inputPageCount}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 0,
                    border: "1px solid #c7d6e3",
                    background: inputPage === inputPageCount ? "#eef3f7" : "#fff",
                    color: "#28485d",
                    fontWeight: 800,
                    cursor: inputPage === inputPageCount ? "not-allowed" : "pointer",
                  }}
                >
                  다음
                </button>
                <button
                  onClick={() => setInputPage(inputPageCount)}
                  disabled={inputPage === inputPageCount}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 0,
                    border: "1px solid #c7d6e3",
                    background: inputPage === inputPageCount ? "#eef3f7" : "#fff",
                    color: "#28485d",
                    fontWeight: 800,
                    cursor: inputPage === inputPageCount ? "not-allowed" : "pointer",
                  }}
                >
                  마지막
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "cargo" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={cargoQueryInput}
              onChange={(event) => setCargoQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                setCargoQuery(cargoQueryInput);
              }}
              placeholder="호차 검색"
              style={{
                width: 220,
                height: 42,
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                padding: "0 14px",
                outline: "none",
                background: "#fff",
              }}
            />
            <button
              onClick={() => setCargoQuery(cargoQueryInput)}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #113247",
                background: "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              조회
            </button>
            <input
              value={cargoStoreQueryInput}
              onChange={(e) => setCargoStoreQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                setStoreSearchQuery(cargoStoreQueryInput);
              }}
              placeholder="점포코드/점포명 검색"
              style={{
                width: 220,
                height: 42,
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                padding: "0 14px",
                outline: "none",
                background: "#fff",
              }}
            />
            <button
              onClick={() => setStoreSearchQuery(cargoStoreQueryInput)}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #113247",
                background: "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              조회
            </button>
            <button
              onClick={() => {
                setCargoQueryInput("");
                setCargoQuery("");
                setCargoStoreQueryInput("");
                setStoreSearchQuery("");
              }}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                background: "#fff",
                color: "#28485d",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              전체
            </button>
            <button
              onClick={() => setShowSupportOnly((v) => !v)}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: `1px solid ${showSupportOnly ? "#7c3aed" : "#c7d6e3"}`,
                background: showSupportOnly ? "#7c3aed" : "#fff",
                color: showSupportOnly ? "#fff" : "#28485d",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              지원만 보기
            </button>
            <input
              value={largeLimit}
              onChange={(event) => setLargeLimit(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="대 기준"
              style={{
                width: 110,
                height: 42,
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                padding: "0 14px",
                outline: "none",
                background: "#fff",
              }}
            />
            <input
              value={smallLimit}
              onChange={(event) => setSmallLimit(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="소 기준"
              style={{
                width: 110,
                height: 42,
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                padding: "0 14px",
                outline: "none",
                background: "#fff",
              }}
            />
            <button
              onClick={saveLimitSettings}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #0f766e",
                background: "#0f766e",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              기준값 저장
            </button>
            <button
              onClick={() => void saveCargoSettings()}
              disabled={cargoSaveBusy || cargoRows.length === 0 || !cargoDirty}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 0,
                border: "1px solid #113247",
                background: cargoSaveBusy || cargoRows.length === 0 || !cargoDirty ? "#cbd5e1" : "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: cargoSaveBusy || cargoRows.length === 0 || !cargoDirty ? "not-allowed" : "pointer",
                marginLeft: "auto",
              }}
            >
              {cargoSaveBusy ? "저장 중..." : "저장"}
            </button>
            {limitsMessage ? (
              <div style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>{limitsMessage}</div>
            ) : null}
            <div style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>
              {showSupportOnly ? `지원 ${filteredCargoRows.length}건` : (cargoQuery || storeSearchQuery) ? `검색 결과 ${filteredCargoRows.length}건` : `전체 ${filteredCargoRows.length}건`}
            </div>
          </div>

          <div style={{ border: "1px solid #d6e4ee", borderRadius: 0, background: "#fff", overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1600 }}>
            <thead>
              <tr style={{ background: "#f8fbfd" }}>
                {cargoColumns.map((column) => (
                  <th
                    key={String(column.key)}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderBottom: "1px solid #e6eef4",
                      fontSize: 13,
                      minWidth: column.width ?? 80,
                      ...getCargoGroupStyle(String(column.key)),
                      ...getCargoHeaderStyle(String(column.key)),
                    }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargoDisplayRows.map((entry, index) => {
                if (entry.kind === "subtotal") {
                  const overLarge = Number(largeLimit || 0) > 0 && entry.total.largeTotal >= Number(largeLimit || 0);
                  const overSmall = Number(smallLimit || 0) > 0 && entry.total.smallTotal >= Number(smallLimit || 0);
                  const subtotalBackground = overLarge || overSmall ? "#fee2e2" : "#eef6fb";
                  const subtotalBorder = overLarge || overSmall ? "#fecaca" : "#d7e4ee";

                  return (
                    <tr key={`subtotal-${entry.carNo}-${index}`} style={{ background: subtotalBackground }}>
                      {cargoColumns.map((column) => {
                        let value: string | number = "";
                        if (column.key === "car_no") value = entry.carNo;
                        else if (column.key === "store_name") value = "부분합";
                        else if (column.key === "largeTotal") value = entry.total.largeTotal;
                        else if (column.key === "smallTotal") value = entry.total.smallTotal;
                        else value = entry.total[column.key as keyof CargoRow] as string | number;

                        return (
                          <td
                            key={`subtotal-${entry.carNo}-${String(column.key)}`}
                            style={{
                              padding: 10,
                              borderBottom: `1px solid ${subtotalBorder}`,
                              fontWeight: 900,
                              ...getStickyCargoStyle(String(column.key), subtotalBackground),
                            }}
                          >
                            {column.key === "seq_no" || column.key === "store_name"
                              ? ""
                              : typeof value === "number"
                                ? formatNumber(value)
                                : String(value ?? "")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                const row = entry.row;
                const sum = cargoTotals(row);
                return (
                  <tr key={row.id} style={{ background: row.support_excluded ? "#e5e7eb" : index % 2 === 0 ? "#fff" : "#fbfdff", opacity: 1 }}>
                    {cargoColumns.map((column) => {
                      const value =
                        column.key === "support"
                          ? row.support_excluded
                          : column.key === "largeTotal"
                            ? sum.largeTotal
                            : column.key === "smallTotal"
                              ? sum.smallTotal
                              : row[column.key as keyof CargoRow];
                      const editable = !["support", "car_no", "seq_no", "largeTotal", "smallTotal", "store_code", "store_name"].includes(String(column.key));

                      return (
                        <td
                          key={`${row.id}-${String(column.key)}`}
                          style={{
                            padding: 8,
                            borderBottom: "1px solid #f0f4f7",
                            ...getCargoGroupStyle(String(column.key)),
                            ...getStickyCargoStyle(
                              String(column.key),
                              row.support_excluded ? "#e5e7eb" : index % 2 === 0 ? "#fff" : "#fbfdff"
                            ),
                          }}
                        >
                          {column.key === "support" ? (
                            <label style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                              <input
                                type="checkbox"
                                checked={Boolean(row.support_excluded)}
                                onChange={(event) => toggleCargoSupport(entry.sourceIndex, event.target.checked)}
                              />
                            </label>
                          ) : column.key === "note" ? (
                            <CargoDriverInput
                              value={String(value ?? "")}
                              onCommit={(nextValue) => updateCargoRow(entry.sourceIndex, "note", nextValue)}
                              driverNames={allDriverNames}
                            />
                          ) : editable ? (
                            <input
                              value={typeof value === "number" ? formatNumber(value) : String(value ?? "")}
                              onChange={(event) => updateCargoRow(entry.sourceIndex, column.key as keyof CargoRow, event.target.value)}
                              style={{ width: "100%", minWidth: 60, height: 34, borderRadius: 0, border: "1px solid #d6e4ee", padding: "0 8px", outline: "none" }}
                            />
                          ) : (
                            <div style={{ padding: "0 4px", fontWeight: column.key === "largeTotal" || column.key === "smallTotal" ? 900 : 500 }}>
                              {typeof value === "number" ? formatNumber(value) : String(value ?? "")}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filteredCargoRows.length === 0 ? (
                <tr>
                  <td colSpan={cargoColumns.length} style={{ padding: 18, color: "#6b7280" }}>
                    단품별 데이터를 먼저 불러와 주세요.
                  </td>
                </tr>
              ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "report" ? (
        <div ref={reportPrintListRef} className="report-print-list" style={{ display: "grid", gap: 20 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "#28485d", fontSize: 13, fontWeight: 800 }}>호차</div>
            <input
              value={reportCarNoInput}
              onChange={(event) => {
                const nextValue = event.target.value.replace(/[^\d]/g, "");
                setReportCarNoInput(nextValue);
                setSupportMode(false);

                const matchedGroup = reportGroups.find((group) => normalizeCarNo(group.carNo) === normalizeCarNo(nextValue));
                if (matchedGroup) {
                  setSelectedReportCarNo(matchedGroup.carNo);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                setSupportMode(false);
                const matchedGroup = reportGroups.find((group) => normalizeCarNo(group.carNo) === normalizeCarNo(reportCarNoInput));
                if (matchedGroup) {
                  setSelectedReportCarNo(matchedGroup.carNo);
                }
              }}
              placeholder="호차 입력"
              inputMode="numeric"
              style={{
                width: 120,
                height: 40,
                borderRadius: 0,
                border: "1px solid #c7d6e3",
                padding: "0 14px",
                outline: "none",
                background: "#fff",
                fontWeight: 800,
                color: "#28485d",
              }}
            />
            <button
              onClick={printSelectedReport}
              disabled={!activeReportGroup || (supportMode && !supportAutoMode && !supportDriverNameInput.trim())}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 0,
                border: "1px solid #0f766e",
                background: !activeReportGroup || (supportMode && !supportAutoMode && !supportDriverNameInput.trim()) ? "#cbd5e1" : "#0f766e",
                color: "#fff",
                fontWeight: 900,
                cursor: !activeReportGroup || (supportMode && !supportAutoMode && !supportDriverNameInput.trim()) ? "not-allowed" : "pointer",
              }}
            >
              출력
            </button>
            {[
              { key: "today", label: "당일" },
              { key: "previous", label: "전일" },
              { key: "next", label: "익일" },
              { key: "all", label: "전체" },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => printAllReports(option.key as "today" | "previous" | "next" | "all")}
                disabled={reportGroups.length === 0}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #113247",
                  background: reportGroups.length === 0 ? "#cbd5e1" : "#fff",
                  color: "#113247",
                  fontWeight: 900,
                  cursor: reportGroups.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {option.label} 출력
              </button>
            ))}
            <button
              onClick={async () => {
                setBatchPrintMode("");
                setSupportMode(true);
                setSupportAutoMode(true);
                setSupportDriverNameInput("");
                setSupportStoreNameInputs(Array.from({ length: 20 }, () => ""));
                setMessage("지원 자동: 기사명+회전별로 자동 출력합니다.");
                const ids = cargoRows.filter((r) => r.support_excluded).map((r) => r.id);
                if (ids.length) {
                  const { data } = await supabase.from("support_rounds").select("row_id,round_no").in("row_id", ids);
                  if (data?.length) {
                    const map: Record<string, string> = {};
                    for (const d of data) map[d.row_id] = d.round_no ?? "";
                    setSupportRoundsMap(map);
                  }
                }
              }}
              disabled={cargoRows.length === 0}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 0,
                border: "1px solid #0f766e",
                background: cargoRows.length === 0 ? "#cbd5e1" : (supportMode && supportAutoMode) ? "#0f766e" : "#134e4a",
                color: "#fff",
                fontWeight: 900,
                cursor: cargoRows.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              지원(자동)
            </button>
            <button
              onClick={() => {
                setBatchPrintMode("");
                setSupportMode(true);
                setSupportAutoMode(false);
                setSupportDriverNameInput("");
                setSupportStoreNameInputs(Array.from({ length: 20 }, () => ""));
                setMessage("지원 수동: 배송기사명과 점포명을 직접 입력해 주세요.");
              }}
              disabled={cargoRows.length === 0}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 0,
                border: "1px solid #113247",
                background: cargoRows.length === 0 ? "#cbd5e1" : (supportMode && !supportAutoMode) ? "#0f766e" : "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: cargoRows.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              지원(수동)
            </button>
          </div>

          {reportGroups.length === 0 ? (
            <div style={{ border: "1px solid #d6e4ee", borderRadius: 0, background: "#fff", padding: 18, color: "#6b7280" }}>
              운행일보를 만들 데이터가 없습니다. 점포마스터의 호차/순번을 확인해 주세요.
            </div>
          ) : null}

          {activeReportGroup ? (
            <div className="report-screen-only" style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>
              현재 표시: {supportMode && supportAutoMode ? "지원 자동" : supportMode ? "지원 수동" : `${activeReportGroup.carNo}호차`}
              {activeReportGroup.driver?.name ? ` / ${activeReportGroup.driver.name}` : ""}
              {supportMode && supportMatchedRows.some((row) => Boolean(row))
                ? ` / ${supportMatchedRows.filter((row): row is CargoRow => Boolean(row)).map((row) => row.store_name).join(", ")}`
                : ""}
            </div>
          ) : null}

          {visibleReportGroups.map((group) => {
            const driverAdhesion = adhesionDriverMap.get(normalizePersonName(group.driver?.name ?? ""));
            const groupCdcTotal = group.rows.reduce((sum, row) => {
              if (row.support_excluded) return sum;
              return sum + getCombinedCdcCount(cdcStoreMap, fullBoxStoreMap, row);
            }, 0);
            return (
            <div key={group.carNo} className="report-print-shell" style={{ border: "2px solid #111", background: "#fff", overflow: "hidden", padding: 12 }}>
              <div
                ref={reportPreviewContainerRef}
                className="report-preview-viewport"
                style={{
                  width: "100%",
                  overflow: "hidden",
                  minHeight: reportPreviewHeight ?? undefined,
                  height: reportPreviewHeight ?? undefined,
                }}
              >
              <div
                ref={reportPreviewContentRef}
                className="report-print-frame"
                style={{
                  width: REPORT_PREVIEW_BASE_WIDTH,
                  transform: `scale(${reportPreviewScale})`,
                  transformOrigin: "top left",
                }}
              >
              <table style={{ width: REPORT_PREVIEW_BASE_WIDTH, borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  {/* 12 cols summing to REPORT_PREVIEW_BASE_WIDTH=1620, right edge 맞춤용 */}
                  {[120, 268, 130, 156, 68, 102, 192, 74, 74, 196, 120, 120].map((w, i) => (
                    <col key={`info-col-${i}`} style={{ width: w }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1" }} rowSpan={6}></td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>납품예정일(D+1)</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 18, fontWeight: 950, textAlign: "center", letterSpacing: -0.2 }} colSpan={2}>{reportDate}</td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }} rowSpan={6}>주행<br />거리</td>
                    <td style={{ width: 72, border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>차고지</td>
                    <td style={{ width: 146, border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td
                                            style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}
                      colSpan={2}
                    >
                      이동거리
                    </td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 20, fontWeight: 950, lineHeight: 1.35, letterSpacing: -0.2 }} rowSpan={3}>대분 : {formatNumber(group.totals.large)}개</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 18, fontWeight: 900, textAlign: "center" }} rowSpan={2}>점착률</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 18, fontWeight: 900, textAlign: "center", background: "#f4d4d9" }} rowSpan={2}>누계</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>배송기사명</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontWeight: 800, textAlign: "center", ...getFittedTextStyle(group.driver?.name ?? "", 13, { minFontSize: 9 }) }}>
                      {supportMode && supportAutoMode ? (
                        <span style={{ fontWeight: 800, fontSize: 13 }}>
                          {group.supportDriverName || "미지정"}
                          {group.supportRound && <span style={{ marginLeft: 6, color: "#7c3aed" }}>{group.supportRound}회전</span>}
                        </span>
                      ) : supportMode && !supportAutoMode ? (
                        <input
                          value={supportDriverNameInput}
                          onChange={(event) => setSupportDriverNameInput(event.target.value)}
                          placeholder="배송기사명"
                          style={{
                            display: "block",
                            width: "100%",
                            height: 24,
                            boxSizing: "border-box",
                            border: "none",
                            outline: "none",
                            padding: "0 2px",
                            textAlign: "center",
                            fontWeight: 800,
                            fontSize: 13,
                            background: "transparent",
                            color: "#111827",
                          }}
                        />
                      ) : (
                        group.driver?.name ?? ""
                      )}
                    </td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontWeight: 800, textAlign: "center", ...getFittedTextStyle(formatPhoneNumber(group.driver?.phone ?? ""), 13, { minFontSize: 9 }) }}>
                      {formatPhoneNumber(group.driver?.phone ?? "")}
                    </td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>센터</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13 }} colSpan={2}>km</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>호차/차량번호</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 15, fontWeight: 900, textAlign: "center" }}>{group.carNo}</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 15, fontWeight: 900, textAlign: "center" }}>{group.driver?.vehicle_number ?? ""}</td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>막점</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13 }} colSpan={2}>km</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 20, fontWeight: 900, textAlign: "center" }} rowSpan={4}>{driverAdhesion?.adhesionRate || ""}</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 20, fontWeight: 900, textAlign: "center", background: "#f4d4d9", color: "#b91c1c" }} rowSpan={4}>{driverAdhesion?.cumulativeRate || ""}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>운수사</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontWeight: 800, textAlign: "center", verticalAlign: "middle" }} colSpan={2}>
                      <div style={{ width: "100%", textAlign: "center", ...getFittedTextStyle(group.driver?.carrier ?? "", 13, { minFontSize: 9 }) }}>
                        {group.driver?.carrier ?? ""}
                      </div>
                    </td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>차고지</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13 }} colSpan={2}>km</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 20, fontWeight: 950, lineHeight: 1.35, letterSpacing: -0.2 }} rowSpan={3}>소분 : {formatNumber(group.totals.small)}개</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>차종</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontWeight: 800, textAlign: "center", ...getFittedTextStyle(group.driver?.vehicle_type ?? "", 13, { minFontSize: 9 }) }} colSpan={2}>{group.driver?.vehicle_type ?? ""}</td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>기타( )</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13 }} colSpan={2}>km</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>차고지</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontWeight: 800, textAlign: "center", ...getFittedTextStyle(group.driver?.garage ?? "", 13, { minFontSize: 9 }) }} colSpan={2}>{group.driver?.garage ?? ""}</td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>계</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 18, fontWeight: 900, textAlign: "right" }} colSpan={3}>km</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: REPORT_PREVIEW_BASE_WIDTH, borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  {reportMainColumnWidths.map((width, index) =>
                    index === 21 ? null : <col key={`${group.carNo}-col-${index}`} style={{ width }} />
                  )}
                </colgroup>
                <thead>
                  <tr style={{ background: "#f1f1f1", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(0) }}>No</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(1) }}>점포명</th>
                    <th className="report-section-top report-section-left report-section-right" colSpan={6} style={{ border: "1px solid #666", borderLeft: REPORT_SECTION_BORDER, borderRight: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13 }}>대</th>
                    <th className="report-section-top report-section-left report-section-right" colSpan={3} style={{ border: "1px solid #666", borderLeft: REPORT_SECTION_BORDER, borderRight: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13 }}>소</th>
                    <th className="report-section-top report-section-left" rowSpan={2} style={{ border: "1px solid #666", borderLeft: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(11) }}>행사</th>
                    <th className="report-section-top" rowSpan={2} style={{ border: "1px solid #666", borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(12) }}>담배</th>
                    <th className="report-section-top" rowSpan={2} style={{ border: "1px solid #666", borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, lineHeight: 1.3, ...getReportMainCellWidth(13) }}>유가<br/>증권</th>
                    <th className="report-section-top report-section-right" rowSpan={2} style={{ border: "1px solid #666", borderRight: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(14) }}>CDC</th>
                    <th colSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13 }}>피박스</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(17) }}>기준시간</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(18) }}>주소</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(19) }}>연락처</th>
                    <th colSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13 }}>{supportMode ? "기존정보" : "전일점착(미스캔X)"}</th>
                  </tr>
                  <tr style={{ background: "#f7f7f7", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                    {([
                      [2, "계"], [3, "박스존"], [4, "이너존"], [5, "기타"], [6, "올데이 2L생수"], [7, "노브랜드2L생수"],
                      [8, "계"], [9, "경량존"], [10, "슬라존"],
                      [15, "출고"], [16, "회수"],
                      [20, supportMode ? "호차" : "등급"], [22, supportMode ? "순번" : "구분"],
                    ] as [number, string][]).map(([colIdx, header], headerIndex) => (
                      <th
                        key={`${group.carNo}-${header}-${colIdx}`}
                        className={[
                          headerIndex === 0 || headerIndex === 6 ? "report-section-top" : "",
                          headerIndex === 0 || headerIndex === 6 ? "report-section-left report-section-right" : "",
                          headerIndex === 8 ? "report-section-right" : "",
                        ].filter(Boolean).join(" ")}
                        style={{
                          border: "1px solid #666",
                          padding: "7px 5px",
                          whiteSpace: "normal",
                          wordBreak: "keep-all",
                          fontSize: header === "올데이 2L생수" || header === "노브랜드2L생수" ? 10 : 13,
                          lineHeight: 1.25,
                          borderTop: headerIndex === 0 || headerIndex === 6 ? REPORT_SECTION_BORDER : undefined,
                          borderBottom: "1px solid #666",
                          borderLeft: headerIndex === 0 || headerIndex === 6 ? REPORT_SECTION_BORDER : "1px solid #666",
                          borderRight: headerIndex === 0 || headerIndex === 6 || headerIndex === 8 ? REPORT_SECTION_BORDER : "1px solid #666",
                          ...getReportMainCellWidth(supportMode && colIdx === 20 ? 22 : supportMode && colIdx === 22 ? 20 : colIdx),
                        }}
                      >
                        {header === "올데이 2L생수" ? (
                          <>올데이<br />2L생수</>
                        ) : header === "노브랜드2L생수" ? (
                          <>노브랜드<br />2L생수</>
                        ) : (
                          header
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...group.rows, ...Array.from({ length: Math.max(0, 20 - group.rows.length) }, (_, i) => ({ id: `blank-${group.carNo}-${i}` } as CargoRow))].slice(0, 20).map((row, index) => {
                    const sum = cargoTotals(row);
                    const reportRowBackground = (!supportMode && row.support_excluded) ? "#111" : "#fff";
                    const reportRowColor = (!supportMode && row.support_excluded) ? "#fff" : undefined;
                    const reportRowPca = (!supportMode && row.support_excluded) ? ({ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties) : {};
                    const storeAdhesion = adhesionStoreMap.get(normalizeStoreName(row.store_name || ""));
                    const storeCdc = getCombinedCdcCount(cdcStoreMap, fullBoxStoreMap, row);
                    return (
                      <tr key={row.id || `${group.carNo}-${index}`} style={{ background: reportRowBackground, height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, lineHeight: 1, ...reportRowPca }}>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontWeight: 700, fontSize: 13, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(0) }}>{index + 1}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: (supportMode && !supportAutoMode) ? 0 : "6px 7px", verticalAlign: "middle", overflow: "hidden", fontWeight: 800, color: reportRowColor, background: reportRowBackground, ...getFittedTextStyle(row.store_name || "", 15, { minFontSize: 11, lineHeight: 1 }), ...getReportMainCellWidth(1), whiteSpace: "nowrap" as const }}>
                          {supportMode && !supportAutoMode ? (
                            <input
                              value={supportStoreNameInputs[index] ?? ""}
                              onChange={(event) => updateSupportStoreNameInput(index, event.target.value)}
                              placeholder="점포명"
                              style={{
                                display: "block",
                                width: "100%",
                                height: REPORT_BODY_ROW_HEIGHT,
                                boxSizing: "border-box",
                                border: "none",
                                outline: "none",
                                padding: "0 7px",
                                margin: 0,
                                fontWeight: 800,
                                fontSize: 13,
                                background: "transparent",
                                color: "#111827",
                                WebkitAppearance: "none",
                                appearance: "none",
                              }}
                            />
                          ) : (
                            row.store_name || ""
                          )}
                        </td>
                        <td className="report-section-left report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontWeight: 900, fontSize: 17, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(2), ...getReportMainCellWidth(2) }}>{row.store_name ? formatReportCount(sum.largeTotal) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(3), ...getReportMainCellWidth(3) }}>{row.large_box ? formatNumber(row.large_box) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(4), ...getReportMainCellWidth(4) }}>{row.large_inner ? formatNumber(row.large_inner) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(5), ...getReportMainCellWidth(5) }}>{row.large_other ? formatNumber(row.large_other) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", color: row.support_excluded ? "#fff" : "#b91c1c", background: reportRowBackground, fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, ...getReportSectionStyle(6), ...getReportMainCellWidth(6) }}>{row.large_day2l ? formatNumber(row.large_day2l) : ""}</td>
                        <td className="report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", color: row.support_excluded ? "#fff" : "#b91c1c", background: reportRowBackground, fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, ...getReportSectionStyle(7), ...getReportMainCellWidth(7) }}>{row.large_nb2l ? formatNumber(row.large_nb2l) : ""}</td>
                        <td className="report-section-left report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontWeight: 900, fontSize: 17, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(8), ...getReportMainCellWidth(8) }}>{row.store_name ? formatReportCount(sum.smallTotal) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(9), ...getReportMainCellWidth(9) }}>{row.small_low ? formatNumber(row.small_low) : ""}</td>
                        <td className="report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(10), ...getReportMainCellWidth(10) }}>{row.small_high ? formatNumber(row.small_high) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(11), ...getReportMainCellWidth(11) }}>{row.event ? formatNumber(row.event) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(12), ...getReportMainCellWidth(12) }}>{row.tobacco ? formatNumber(row.tobacco) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(13), ...getReportMainCellWidth(13) }}>{row.certificate ? formatNumber(row.certificate) : ""}</td>
                        <td className="report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(14), ...getReportMainCellWidth(14) }}>{row.store_name && storeCdc > 0 ? formatNumber(storeCdc) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(15) }}>{row.pbox ? formatNumber(row.pbox) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, background: reportRowBackground, ...getReportMainCellWidth(16) }}></td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 19, fontWeight: 900, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(17) }}>{row.standard_time || ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", verticalAlign: "middle", color: reportRowColor, background: reportRowBackground, ...getAddressTextStyle(row.address || ""), ...getReportMainCellWidth(18) }}>{row.address || ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", whiteSpace: "nowrap", fontSize: 15, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(19) }}>{row.store_name ? formatPhone(storeContactIndex.get(row.store_name) ?? "") : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "5px 4px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, fontWeight: 900, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(supportMode ? 22 : 20) }}>{row.store_name ? (supportMode ? (row.car_no || "") : (storeAdhesion?.postGrade || "")) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, fontWeight: row.support_excluded ? 900 : 400, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(supportMode ? 20 : 22) }}>{row.store_name ? (supportMode ? (row.seq_no ? String(row.seq_no) : "") : (storeAdhesion?.category || "")) : ""}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#fafafa" }}>
                    <td style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: 13, ...getReportMainCellWidth(0) }}>계</td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(1) }}></td>
                    <td className="report-section-left report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(2), ...getReportMainCellWidth(2) }}>{formatReportTotal(group.totals.large)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(3), ...getReportMainCellWidth(3) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_box, supportAutoMode))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(4), ...getReportMainCellWidth(4) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_inner, supportAutoMode))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(5), ...getReportMainCellWidth(5) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_other, supportAutoMode))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, color: "#b91c1c", ...getReportSectionTotalStyle(6), ...getReportMainCellWidth(6) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_day2l, supportAutoMode))}</td>
                    <td className="report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, color: "#b91c1c", ...getReportSectionTotalStyle(7), ...getReportMainCellWidth(7) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_nb2l, supportAutoMode))}</td>
                    <td className="report-section-left report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(8), ...getReportMainCellWidth(8) }}>{formatReportTotal(group.totals.small)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(9), ...getReportMainCellWidth(9) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.small_low, supportAutoMode))}</td>
                    <td className="report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(10), ...getReportMainCellWidth(10) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.small_high, supportAutoMode))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(11), ...getReportMainCellWidth(11) }}>{formatReportTotal(group.totals.event)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(12), ...getReportMainCellWidth(12) }}>{formatReportTotal(group.totals.tobacco)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(13), ...getReportMainCellWidth(13) }}>{formatReportTotal(group.totals.certificate)}</td>
                    <td className="report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(14), ...getReportMainCellWidth(14) }}>{groupCdcTotal > 0 ? formatReportTotal(groupCdcTotal) : ""}</td>
                    <td style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: 13, ...getReportMainCellWidth(15) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(16) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(17) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(18) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(19) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(supportMode ? 22 : 20) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(supportMode ? 20 : 22) }}></td>
                  </tr>
                </tbody>
              </table>
              </div>
              </div>
            </div>
          )})}
        </div>
      ) : null}
    </div>
  );
}

export default function VehiclePage() {
  return <VehiclePageScreen initialTab="cargo" allowedTabs={["cargo"]} />;
}
