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
  car_no: string;
  seq_no: number;
  delivery_due_time: string;
  address: string;
};

type DriverProfile = {
  name: string;
  phone: string;
  car_no: string;
  vehicle_type: string;
  carrier: string;
  garage: string;
};

type ReportGroup = {
  carNo: string;
  rows: CargoRow[];
  driver?: DriverProfile;
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
};

type VehicleLimitsSnapshot = {
  largeLimit?: number;
  smallLimit?: number;
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


const cargoColumns: Array<{ key: keyof CargoRow | "largeTotal" | "smallTotal" | "support"; label: string; width?: number }> = [
  { key: "support", label: "지원", width: 64 },
  { key: "car_no", label: "호차", width: 80 },
  { key: "seq_no", label: "순번", width: 70 },
  { key: "store_code", label: "점포코드", width: 110 },
  { key: "store_name", label: "점포명", width: 180 },
  { key: "largeTotal", label: "대", width: 80 },
  { key: "large_box", label: "박스", width: 80 },
  { key: "large_inner", label: "이너팩", width: 80 },
  { key: "large_other", label: "기타", width: 80 },
  { key: "large_day2l", label: "올데이 2L생수", width: 92 },
  { key: "large_nb2l", label: "노브랜드2L생수", width: 92 },
  { key: "smallTotal", label: "소", width: 80 },
  { key: "small_low", label: "저회전", width: 80 },
  { key: "small_high", label: "고회전", width: 80 },
  { key: "event", label: "행사", width: 80 },
  { key: "tobacco", label: "담배", width: 80 },
  { key: "certificate", label: "유가증권", width: 90 },
];

const stickyCargoColumnKeys = ["support", "car_no", "seq_no", "store_code", "store_name"] as const;
const reportMainColumnWidths = [
  42,
  180,
  56,
  56,
  56,
  56,
  56,
  56,
  56,
  56,
  56,
  58,
  58,
  72,
  56,
  44,
  44,
  84,
  200,
  90,
  54,
  54,
  78,
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

function cargoTotals(row: CargoRow) {
  const largeTotal = row.large_box + row.large_inner + row.large_other;
  const smallTotal = row.small_low + row.small_high;
  return { largeTotal, smallTotal };
}

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

async function fetchDriverProfileIndex(carNos: string[]) {
  const normalizedCarNos = [...new Set(carNos.map(normalizeCarNo).filter(Boolean))];
  if (normalizedCarNos.length === 0) return new Map<string, DriverProfile>();

  const carNoFilter = normalizedCarNos.map((carNo) => `car_no.ilike.%${carNo}%`).join(",");
  const { data, error } = await supabase
    .from("profiles")
    .select("name,phone,car_no,vehicle_type,carrier,garage")
    .ilike("work_part", "%기사%")
    .or(carNoFilter);

  if (error) throw new Error("기사 사용자마스터를 불러오지 못했습니다.");

  const index = new Map<string, DriverProfile>();
  for (const row of data ?? []) {
    const tokens = splitCarTokens((row as any).car_no);
    for (const token of tokens) {
      if (!normalizedCarNos.includes(token) || index.has(token)) continue;
      index.set(token, {
        name: toText((row as any).name),
        phone: toText((row as any).phone),
        car_no: token,
        vehicle_type: toText((row as any).vehicle_type),
        carrier: toText((row as any).carrier),
        garage: toText((row as any).garage),
      });
    }
  }

  return index;
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const normalizedValue = compactMatch ? `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}` : value;
  const date = new Date(`${normalizedValue}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

function addDaysYmd(value: string, days: number) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sumIncludedRows(rows: CargoRow[], selector: (row: CargoRow) => number) {
  return rows.reduce((sum, row) => sum + (row.support_excluded ? 0 : selector(row)), 0);
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
  let fontSize = 10;

  if (text.length >= 44) fontSize = 5;
  else if (text.length >= 40) fontSize = 6;
  else if (text.length >= 36) fontSize = 7;
  else if (text.length >= 32) fontSize = 8;
  else if (text.length >= 26) fontSize = 9;

  return {
    fontSize,
    lineHeight: 1,
    letterSpacing: fontSize <= 6 ? -0.4 : fontSize <= 8 ? -0.25 : -0.1,
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
      } satisfies ReportGroup;
    });
}

function updateCargoByProduct(target: CargoRow, row: ProductRow) {
  const qty = qtyBase(row);
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
  selectedReportCarNo?: string
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

  const cargoSheetRows = [
    ["호차", "순번", "점포코드", "점포명", "대", "박스", "이너팩", "기타", "올데이 2L생수", "노브랜드2L생수", "소", "저회전", "고회전", "행사", "담배", "유가증권"],
    ...cargoRows.map((row) => {
      const totals = cargoTotals(row);
      return [
        row.car_no, row.seq_no, row.store_code, row.store_name, totals.largeTotal, row.large_box, row.large_inner, row.large_other,
        row.large_day2l, row.large_nb2l, totals.smallTotal, row.small_low, row.small_high, row.event, row.tobacco, row.certificate,
      ];
    }),
  ];

  const reportSheetRows: (string | number)[][] = [];
  const reportSheetMerges: XLSX.Range[] = [];

  for (const [groupIndex, group] of targetReportGroups.entries()) {
    const startRow = reportSheetRows.length;
    const formattedDriverPhone = formatPhoneNumber(group.driver?.phone ?? "");
    const driverLabel = group.driver?.name ? group.driver.name + (formattedDriverPhone ? ` / ${formattedDriverPhone}` : "") : "";

    reportSheetRows.push(["", "납품예정일(D+1)", reportDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "대분", group.totals.large, "점착률", "100.0%"]);
    reportSheetRows.push(["", "배송기사명", group.driver?.name ?? "", "연락처", formattedDriverPhone, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "소분", group.totals.small, "누계", "100.0%"]);
    reportSheetRows.push(["", "호차/차량번호", group.carNo, group.driver?.vehicle_type ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["", "운수사", group.driver?.carrier ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["", "차종", group.driver?.vehicle_type ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["", "차고지", group.driver?.garage ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    reportSheetRows.push(["No", "점포명", "대", "", "", "", "", "", "소", "", "", "행사", "담배", "유가증권", "CDC", "피박스", "", "기준시간", "주소", "연락처", "전일점착(미스캔X)", "", ""]);
    reportSheetRows.push(["", "", "계", "박스", "이너팩", "기타", "올데이 2L생수", "노브랜드2L생수", "계", "저회전", "고회전", "", "", "", "", "출고", "회수", "", "", "", "등급", "소명점포", "구분"]);

    const printableRows = [...group.rows];
    while (printableRows.length < 20) {
      printableRows.push({
        id: `blank-${group.carNo}-${printableRows.length}`,
        support_excluded: false,
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
        "",
        "",
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
  const reportSheet = XLSX.utils.aoa_to_sheet(reportSheetRows);
  reportSheet["!merges"] = reportSheetMerges;
  reportSheet["!cols"] = [
    { wch: 6 }, { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }
  ];
  XLSX.utils.book_append_sheet(workbook, reportSheet, "운행일보");
  XLSX.writeFile(workbook, `차량관리-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function cardStyle() {
  return {
    border: "1px solid #d6e4ee",
    borderRadius: 18,
    background: "#fff",
    padding: 16,
  } as const;
}

type VehicleTab = "input" | "cargo" | "report";

export function VehiclePageScreen({
  initialTab = "input",
  allowedTabs = ["input", "cargo", "report"],
}: {
  initialTab?: VehicleTab;
  allowedTabs?: VehicleTab[];
}) {
  const INPUT_PAGE_SIZE = 50;
  const REPORT_PREVIEW_BASE_WIDTH = 1620;
  const REPORT_PRINT_SCALE = 0.66;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reportPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const reportPreviewContentRef = useRef<HTMLDivElement | null>(null);
  const driverFetchKeyRef = useRef("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [cargoRows, setCargoRows] = useState<CargoRow[]>([]);
  const [tab, setTab] = useState<VehicleTab>(initialTab);
  const [storeQueryInput, setStoreQueryInput] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [cargoQueryInput, setCargoQueryInput] = useState("");
  const [cargoQuery, setCargoQuery] = useState("");
  const [largeLimit, setLargeLimit] = useState("");
  const [smallLimit, setSmallLimit] = useState("");
  const [limitsMessage, setLimitsMessage] = useState("");
  const [inputPage, setInputPage] = useState(1);
  const [storageReady, setStorageReady] = useState(false);
  const [driverIndex, setDriverIndex] = useState<Map<string, DriverProfile>>(new Map());
  const [reportCarNoInput, setReportCarNoInput] = useState("");
  const [selectedReportCarNo, setSelectedReportCarNo] = useState("");
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
        const saved = await readVehicleSnapshot();
        if (saved) {
          setFileName(saved.fileName ?? "");
          setProductRows(Array.isArray(saved.productRows) ? saved.productRows : []);
          setCargoRows(Array.isArray(saved.cargoRows) ? saved.cargoRows : []);
        }

        const savedLimits = await readVehicleLimitsSnapshot();
        if (savedLimits) {
          setLargeLimit(savedLimits.largeLimit ? String(savedLimits.largeLimit) : "");
          setSmallLimit(savedLimits.smallLimit ? String(savedLimits.smallLimit) : "");
        }
      } finally {
        setStorageReady(true);
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
    if (tab !== "report") return;
    const carNos = [...new Set(cargoRows.map((row) => normalizeCarNo(row.car_no)).filter(Boolean))];
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
  }, [cargoRows, tab]);

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

  const reportGroups = useMemo(() => buildReportGroups(cargoRows, driverIndex), [cargoRows, driverIndex]);
  const selectedReportGroup = useMemo(() => {
    if (reportGroups.length === 0) return null;
    return reportGroups.find((group) => normalizeCarNo(group.carNo) === normalizeCarNo(selectedReportCarNo)) ?? reportGroups[0];
  }, [reportGroups, selectedReportCarNo]);
  const visibleReportGroups = batchPrintMode ? reportGroups : selectedReportGroup ? [selectedReportGroup] : [];

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
    const query = normalizeStoreName(cargoQuery);
    const rows = query
      ? cargoRows.filter((row) => normalizeStoreName(row.car_no).includes(query))
      : cargoRows;

    return [...rows].sort((a, b) => {
      const carDiff = a.car_no.localeCompare(b.car_no, "ko", { numeric: true });
      if (carDiff !== 0) return carDiff;
      if (a.seq_no !== b.seq_no) return a.seq_no - b.seq_no;
      return a.store_name.localeCompare(b.store_name, "ko");
    });
  }, [cargoRows, cargoQuery]);

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
  }, [reportPreviewScale, selectedReportGroup, reportDate]);

  const loadRows = async (file: File) => {
    setBusy(true);
    setMessage("");

    try {
      const rows = await parseWorkbookProductRows(file);
      const storeMapIndex = await fetchStoreMapIndexByRows(rows);
      const { mappedRows, matchedCount } = applyStoreMap(rows, storeMapIndex);
      const draft = buildCargoDraft(mappedRows);

      setProductRows(mappedRows);
      setCargoRows(draft);
      setFileName(file.name);
      setStoreQuery("");
      setStoreQueryInput("");
      setCargoQuery("");
      setCargoQueryInput("");
      setInputPage(1);
      setTab("cargo");
      setMessage(`점포명 기준 ${matchedCount}건 매칭, 단품별 ${mappedRows.length}건 / 물동량 ${draft.length}개 점포 초안 생성 완료`);
    } catch (error: any) {
      setProductRows([]);
      setCargoRows([]);
      setMessage(error?.message ?? "불러오기 실패");
    } finally {
      setBusy(false);
    }
  };

  const updateCargoRow = (index: number, key: keyof CargoRow, value: string) => {
    setCargoRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (key === "standard_time") return { ...row, [key]: value };
        if (key === "car_no" || key === "store_code" || key === "store_name") return { ...row, [key]: value };
        return { ...row, [key]: toNumber(value) } as CargoRow;
      })
    );
  };

  const toggleCargoSupport = (index: number, checked: boolean) => {
    setCargoRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, support_excluded: checked } : row))
    );
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
    void clearVehicleSnapshot().catch(() => {});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveLimitSettings = () => {
    void writeVehicleLimitsSnapshot({
      largeLimit: Number(largeLimit || 0),
      smallLimit: Number(smallLimit || 0),
    })
      .then(() => setLimitsMessage("기준값 저장됨"))
      .catch(() => setLimitsMessage("기준값 저장 실패"));
  };

  const printSelectedReport = () => {
    if (!selectedReportGroup) return;
    setBatchPrintMode("");
    window.print();
  };

  const printAllReports = (mode: "today" | "previous" | "next" | "all") => {
    if (reportGroups.length === 0) return;
    setBatchPrintMode(mode);
    window.setTimeout(() => {
      window.print();
    }, 50);
  };

  useEffect(() => {
    const handleAfterPrint = () => setBatchPrintMode("");
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const topCardStyle = cardStyle();

  return (
    <div style={{ display: "grid", gap: 16 }} className="vehicle-page">
      <style jsx global>{`
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
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body * {
            visibility: hidden;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .report-print-shell, .report-print-shell * {
            visibility: visible;
          }

          .vehicle-page {
            display: block !important;
            gap: 0 !important;
          }

          .report-print-shell {
            position: fixed;
            inset: 0;
            width: 297mm;
            height: 210mm;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
            background: #fff !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding-left: 6mm !important;
            box-sizing: border-box !important;
          }

          .report-print-frame {
            width: ${REPORT_PREVIEW_BASE_WIDTH}px !important;
            zoom: ${REPORT_PRINT_SCALE} !important;
            transform: none !important;
            transform-origin: top left !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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

          .report-preview-viewport {
            width: 100% !important;
            overflow: visible !important;
            min-height: auto !important;
            height: auto !important;
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
          borderRadius: 20,
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
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 12,
                border: "1px solid #0f766e",
                background: "#0f766e",
                color: "#fff",
                fontWeight: 900,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "불러오는 중..." : "단품별 파일 불러오기"}
            </button>
            <button
              onClick={() => exportWorkbook(productRows, cargoRows, reportGroups, reportDate, selectedReportGroup?.carNo)}
              disabled={cargoRows.length === 0}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 12,
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
                borderRadius: 12,
                border: "1px solid #c7d6e3",
                background: productRows.length === 0 && cargoRows.length === 0 ? "#eef3f7" : "#fff",
                color: "#28485d",
                fontWeight: 900,
                cursor: productRows.length === 0 && cargoRows.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              초기화
            </button>
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
          </div>
        </div>

        <div style={{ marginTop: 12, color: "#29485e", fontSize: 13, fontWeight: 700 }}>
          {fileName ? `현재 데이터: ${fileName}` : "단품별 파일만 올리면 됩니다."}
        </div>
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
                borderRadius: 999,
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
                borderRadius: 12,
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
                borderRadius: 12,
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
                borderRadius: 12,
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

          <div style={{ border: "1px solid #d6e4ee", borderRadius: 18, background: "#fff", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fbfd" }}>
                  {["호차", "순번", "점포코드", "점포명", "작업구분", "셀", "상품코드", "상품명", "출고배수"].map((header) => (
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
                    <td style={{ padding: 12, borderBottom: "1px solid #f0f4f7" }}>{formatNumber(qtyBase(row))}</td>
                  </tr>
                ))}
                {pagedProductRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 18, color: "#6b7280" }}>
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
                    borderRadius: 10,
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
                    borderRadius: 10,
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
                    borderRadius: 10,
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
                    borderRadius: 10,
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
                borderRadius: 12,
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
                borderRadius: 12,
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
              }}
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: 12,
                border: "1px solid #c7d6e3",
                background: "#fff",
                color: "#28485d",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              전체
            </button>
            <input
              value={largeLimit}
              onChange={(event) => setLargeLimit(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="대 기준"
              style={{
                width: 110,
                height: 42,
                borderRadius: 12,
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
                borderRadius: 12,
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
                borderRadius: 12,
                border: "1px solid #0f766e",
                background: "#0f766e",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              기준값 저장
            </button>
            {limitsMessage ? (
              <div style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>{limitsMessage}</div>
            ) : null}
            <div style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>
              {cargoQuery ? `호차 검색 결과 ${filteredCargoRows.length}건` : `전체 ${filteredCargoRows.length}건`}
            </div>
          </div>

          <div style={{ border: "1px solid #d6e4ee", borderRadius: 18, background: "#fff", overflow: "auto", maxHeight: "70vh" }}>
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
                  const overLarge = Number(largeLimit || 0) > 0 && entry.total.largeTotal > Number(largeLimit || 0);
                  const overSmall = Number(smallLimit || 0) > 0 && entry.total.smallTotal > Number(smallLimit || 0);
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
                  <tr key={row.id} style={{ background: row.support_excluded ? "#c1121f" : index % 2 === 0 ? "#fff" : "#fbfdff", opacity: 1 }}>
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
                              row.support_excluded ? "#c1121f" : index % 2 === 0 ? "#fff" : "#fbfdff"
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
                          ) : editable ? (
                            <input
                              value={typeof value === "number" ? formatNumber(value) : String(value ?? "")}
                              onChange={(event) => updateCargoRow(entry.sourceIndex, column.key as keyof CargoRow, event.target.value)}
                              style={{ width: "100%", minWidth: 60, height: 34, borderRadius: 10, border: "1px solid #d6e4ee", padding: "0 8px", outline: "none" }}
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
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "#28485d", fontSize: 13, fontWeight: 800 }}>호차</div>
            <input
              value={reportCarNoInput}
              onChange={(event) => {
                const nextValue = event.target.value.replace(/[^\d]/g, "");
                setReportCarNoInput(nextValue);

                const matchedGroup = reportGroups.find((group) => normalizeCarNo(group.carNo) === normalizeCarNo(nextValue));
                if (matchedGroup) {
                  setSelectedReportCarNo(matchedGroup.carNo);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
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
                borderRadius: 12,
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
              disabled={!selectedReportGroup}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 12,
                border: "1px solid #0f766e",
                background: selectedReportGroup ? "#0f766e" : "#cbd5e1",
                color: "#fff",
                fontWeight: 900,
                cursor: selectedReportGroup ? "pointer" : "not-allowed",
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
                  borderRadius: 12,
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
              onClick={() => {
                const matchedGroup = reportGroups.find((group) => normalizeCarNo(group.carNo) === normalizeCarNo(reportCarNoInput));
                if (matchedGroup) {
                  setSelectedReportCarNo(matchedGroup.carNo);
                }
              }}
              disabled={reportGroups.length === 0}
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 12,
                border: "1px solid #113247",
                background: reportGroups.length === 0 ? "#cbd5e1" : "#113247",
                color: "#fff",
                fontWeight: 900,
                cursor: reportGroups.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              변경
            </button>
          </div>

          {reportGroups.length === 0 ? (
            <div style={{ border: "1px solid #d6e4ee", borderRadius: 18, background: "#fff", padding: 18, color: "#6b7280" }}>
              운행일보를 만들 데이터가 없습니다.
            </div>
          ) : null}

          {selectedReportGroup ? (
            <div className="report-screen-only" style={{ color: "#486274", fontSize: 13, fontWeight: 700 }}>
              현재 표시: {selectedReportGroup.carNo}호차
              {selectedReportGroup.driver?.name ? ` / ${selectedReportGroup.driver.name}` : ""}
            </div>
          ) : null}

          {visibleReportGroups.map((group) => (
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
                <tbody>
                  <tr>
                    <td style={{ width: 120, border: "1px solid #666", background: "#f1f1f1" }} rowSpan={6}></td>
                    <td style={{ width: 228, border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>납품예정일(D+1)</td>
                    <td style={{ width: 212, border: "1px solid #666", padding: "6px 8px", fontSize: 18, fontWeight: 950, textAlign: "center", letterSpacing: -0.2 }} colSpan={2}>{reportDate}</td>
                    <td style={{ width: 68, border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }} rowSpan={6}>주행<br />거리</td>
                    <td style={{ width: 72, border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>차고지</td>
                    <td style={{ width: 146, border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td
                      style={{ width: 148, border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}
                      colSpan={2}
                    >
                      이동거리
                    </td>
                    <td style={{ width: 132, border: "1px solid #666", padding: "6px 8px", fontSize: 20, fontWeight: 950, lineHeight: 1.35, letterSpacing: -0.2 }} rowSpan={3}>대분 : {formatNumber(group.totals.large)}개</td>
                    <td style={{ width: 94, border: "1px solid #666", padding: "6px 8px", fontSize: 15, fontWeight: 900, textAlign: "center" }} rowSpan={2}>점착률</td>
                    <td style={{ width: 94, border: "1px solid #666", padding: "6px 8px", fontSize: 15, fontWeight: 900, textAlign: "center", background: "#f4d4d9" }} rowSpan={2}>누계</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13 }}>배송기사명</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontWeight: 800, textAlign: "center", ...getFittedTextStyle(group.driver?.name ?? "", 13, { minFontSize: 9 }) }}>
                      {group.driver?.name ?? ""}
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
                    <td style={{ border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td style={{ border: "1px solid #666", background: "#f1f1f1", padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center" }}>막점</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px" }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13 }} colSpan={2}>km</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 15, fontWeight: 900, textAlign: "center" }} rowSpan={4}>100.0%</td>
                    <td style={{ border: "1px solid #666", padding: "6px 8px", fontSize: 15, fontWeight: 900, textAlign: "center", background: "#f4d4d9", color: "#b91c1c" }} rowSpan={4}>100.0%</td>
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
                  {reportMainColumnWidths.map((width, index) => (
                    <col key={`${group.carNo}-col-${index}`} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ background: "#f1f1f1" }}>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(0) }}>No</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(1) }}>점포명</th>
                    <th className="report-section-top report-section-left report-section-right" colSpan={6} style={{ border: "1px solid #666", borderLeft: REPORT_SECTION_BORDER, borderRight: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13 }}>대</th>
                    <th className="report-section-top report-section-left report-section-right" colSpan={3} style={{ border: "1px solid #666", borderLeft: REPORT_SECTION_BORDER, borderRight: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13 }}>소</th>
                    <th className="report-section-top report-section-left" rowSpan={2} style={{ border: "1px solid #666", borderLeft: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(11) }}>행사</th>
                    <th className="report-section-top" rowSpan={2} style={{ border: "1px solid #666", borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(12) }}>담배</th>
                    <th className="report-section-top" rowSpan={2} style={{ border: "1px solid #666", borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(13) }}>유가증권</th>
                    <th className="report-section-top report-section-right" rowSpan={2} style={{ border: "1px solid #666", borderRight: REPORT_SECTION_BORDER, borderTop: REPORT_SECTION_BORDER, padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(14) }}>CDC</th>
                    <th colSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13 }}>피박스</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(17) }}>기준시간</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(18) }}>주소</th>
                    <th rowSpan={2} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13, ...getReportMainCellWidth(19) }}>연락처</th>
                    <th colSpan={3} style={{ border: "1px solid #666", padding: "7px 5px", fontSize: 13 }}>전일점착(미스캔X)</th>
                  </tr>
                  <tr style={{ background: "#f7f7f7" }}>
                    {["계", "박스", "이너팩", "기타", "올데이 2L생수", "노브랜드2L생수", "계", "저회전", "고회전", "출고", "회수", "등급", "소명점포", "구분"].map((header, headerIndex) => (
                      <th
                        key={`${group.carNo}-${header}`}
                        className={[
                          headerIndex === 0 || headerIndex === 6 ? "report-section-top" : "",
                          headerIndex === 0 || headerIndex === 6 ? "report-section-left report-section-right" : "",
                          headerIndex === 8 ? "report-section-right" : "",
                        ].filter(Boolean).join(" ")}
                        style={{
                          border: "1px solid #666",
                          padding: "7px 5px",
                          whiteSpace: "normal",
                          wordBreak: header === "올데이 2L생수" || header === "노브랜드2L생수" ? "keep-all" : "keep-all",
                          fontSize: header === "올데이 2L생수" || header === "노브랜드2L생수" ? 10 : header === "소명점포" ? 10 : 13,
                          lineHeight: 1.25,
                          borderTop: headerIndex === 0 || headerIndex === 6 ? REPORT_SECTION_BORDER : undefined,
                          borderBottom: "1px solid #666",
                          borderLeft: headerIndex === 0 || headerIndex === 6 ? REPORT_SECTION_BORDER : "1px solid #666",
                          borderRight: headerIndex === 0 || headerIndex === 6 || headerIndex === 8 ? REPORT_SECTION_BORDER : "1px solid #666",
                          ...getReportMainCellWidth(headerIndex + 2),
                        }}
                      >
                        {header === "올데이 2L생수" ? (
                          <>
                            올데이
                            <br />
                            2L생수
                          </>
                        ) : header === "노브랜드2L생수" ? (
                          <>
                            노브랜드
                            <br />
                            2L생수
                          </>
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
                    const reportRowBackground = row.support_excluded ? "#111" : "#fff";
                    const reportRowColor = row.support_excluded ? "#fff" : undefined;
                    return (
                      <tr key={row.id || `${group.carNo}-${index}`} style={{ background: reportRowBackground, height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, lineHeight: 1 }}>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontWeight: 700, fontSize: 13, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(0) }}>{index + 1}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 7px", verticalAlign: "middle", overflow: "hidden", fontWeight: 800, color: reportRowColor, background: reportRowBackground, ...getFittedTextStyle(row.store_name || "", 13, { minFontSize: 9, lineHeight: 1 }), ...getReportMainCellWidth(1) }}>{row.store_name || ""}</td>
                        <td className="report-section-left report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(2), ...getReportMainCellWidth(2) }}>{row.store_name ? formatReportCount(sum.largeTotal) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(3), ...getReportMainCellWidth(3) }}>{row.large_box ? formatNumber(row.large_box) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(4), ...getReportMainCellWidth(4) }}>{row.large_inner ? formatNumber(row.large_inner) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(5), ...getReportMainCellWidth(5) }}>{row.large_other ? formatNumber(row.large_other) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", color: row.support_excluded ? "#fff" : "#b91c1c", background: reportRowBackground, fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, ...getReportSectionStyle(6), ...getReportMainCellWidth(6) }}>{row.large_day2l ? formatNumber(row.large_day2l) : ""}</td>
                        <td className="report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", color: row.support_excluded ? "#fff" : "#b91c1c", background: reportRowBackground, fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, ...getReportSectionStyle(7), ...getReportMainCellWidth(7) }}>{row.large_nb2l ? formatNumber(row.large_nb2l) : ""}</td>
                        <td className="report-section-left report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(8), ...getReportMainCellWidth(8) }}>{row.store_name ? formatReportCount(sum.smallTotal) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(9), ...getReportMainCellWidth(9) }}>{row.small_low ? formatNumber(row.small_low) : ""}</td>
                        <td className="report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(10), ...getReportMainCellWidth(10) }}>{row.small_high ? formatNumber(row.small_high) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(11), ...getReportMainCellWidth(11) }}>{row.event ? formatNumber(row.event) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(12), ...getReportMainCellWidth(12) }}>{row.tobacco ? formatNumber(row.tobacco) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(13), ...getReportMainCellWidth(13) }}>{row.certificate ? formatNumber(row.certificate) : ""}</td>
                        <td className="report-section-right" style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: REPORT_NUMBER_FONT_SIZE, color: reportRowColor, background: reportRowBackground, ...getReportSectionStyle(14), ...getReportMainCellWidth(14) }}>{row.cdc ? formatNumber(row.cdc) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(15) }}>{row.pbox ? formatNumber(row.pbox) : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, background: reportRowBackground, ...getReportMainCellWidth(16) }}></td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 16, fontWeight: 900, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(17) }}>{row.standard_time || ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", verticalAlign: "middle", color: reportRowColor, background: reportRowBackground, ...getAddressTextStyle(row.address || ""), ...getReportMainCellWidth(18) }}>{row.address || ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", verticalAlign: "middle", overflow: "hidden", fontSize: 13, background: reportRowBackground, ...getReportMainCellWidth(19) }}></td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "5px 4px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, fontWeight: 900, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(20) }}>{row.store_name ? "C" : ""}</td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", verticalAlign: "middle", overflow: "hidden", fontSize: 13, background: reportRowBackground, ...getReportMainCellWidth(21) }}></td>
                        <td style={{ border: "1px solid #666", height: REPORT_BODY_ROW_HEIGHT, minHeight: REPORT_BODY_ROW_HEIGHT, maxHeight: REPORT_BODY_ROW_HEIGHT, padding: "6px 5px", textAlign: "center", verticalAlign: "middle", overflow: "hidden", fontSize: 13, fontWeight: row.support_excluded ? 900 : 400, color: reportRowColor, background: reportRowBackground, ...getReportMainCellWidth(22) }}>{row.store_name ? (row.support_excluded ? "지원제외" : "정상") : ""}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#fafafa" }}>
                    <td style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: 13, ...getReportMainCellWidth(0) }}>계</td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(1) }}></td>
                    <td className="report-section-left report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(2), ...getReportMainCellWidth(2) }}>{formatReportTotal(group.totals.large)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(3), ...getReportMainCellWidth(3) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_box))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(4), ...getReportMainCellWidth(4) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_inner))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(5), ...getReportMainCellWidth(5) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_other))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, color: "#b91c1c", ...getReportSectionTotalStyle(6), ...getReportMainCellWidth(6) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_day2l))}</td>
                    <td className="report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_WATER_NUMBER_FONT_SIZE, color: "#b91c1c", ...getReportSectionTotalStyle(7), ...getReportMainCellWidth(7) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.large_nb2l))}</td>
                    <td className="report-section-left report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(8), ...getReportMainCellWidth(8) }}>{formatReportTotal(group.totals.small)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(9), ...getReportMainCellWidth(9) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.small_low))}</td>
                    <td className="report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(10), ...getReportMainCellWidth(10) }}>{formatReportTotal(sumIncludedRows(group.rows, (row) => row.small_high))}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(11), ...getReportMainCellWidth(11) }}>{formatReportTotal(group.totals.event)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(12), ...getReportMainCellWidth(12) }}>{formatReportTotal(group.totals.tobacco)}</td>
                    <td className="report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(13), ...getReportMainCellWidth(13) }}>{formatReportTotal(group.totals.certificate)}</td>
                    <td className="report-section-right report-section-bottom" style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: REPORT_NUMBER_FONT_SIZE, ...getReportSectionTotalStyle(14), ...getReportMainCellWidth(14) }}>{formatReportTotal(group.totals.cdc)}</td>
                    <td style={{ border: "1px solid #666", padding: "7px 5px", textAlign: "center", fontWeight: 900, fontSize: 13, ...getReportMainCellWidth(15) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(16) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(17) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(18) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(19) }}></td>
                    <td style={{ border: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(20) }}></td>
                    <td style={{ border: "1px solid #666", borderLeft: "1px solid #666", borderRight: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(21) }}></td>
                    <td style={{ border: "1px solid #666", borderRight: "1px solid #666", padding: "6px 4px", ...getReportMainCellWidth(22) }}></td>
                  </tr>
                </tbody>
              </table>
              </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function VehiclePage() {
  return <VehiclePageScreen initialTab="input" allowedTabs={["input", "cargo"]} />;
}

