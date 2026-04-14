"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

// ─── Elogis Sync Panel ────────────────────────────────────────────────────────

type SyncResult = { slotKey: string; label: string; ok: boolean; message: string };

type SyncStatus = {
  ok: boolean;
  agentOnline: boolean;
  lastHeartbeat: string | null;
  pending: boolean;
  running: boolean;
  latest: {
    id: number;
    status: string;
    requested_at: string;
    started_at: string | null;
    completed_at: string | null;
    results: SyncResult[] | null;
    error_text: string | null;
    log_tail: string[] | null;
  } | null;
};

function ElogisSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/elogis-sync/status");
      const json = await res.json();
      if (json.ok) setStatus(json);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleTrigger = async () => {
    if (triggering) return;
    setTriggering(true);
    try {
      const res = await fetch("/api/admin/elogis-sync/start", { method: "POST" });
      const json = await res.json();
      if (json.ok) await fetchStatus();
      else alert(json.message ?? "요청 실패");
    } catch {
      alert("요청 중 오류가 발생했습니다.");
    } finally {
      setTriggering(false);
    }
  };

  const isBusy = status?.pending || status?.running;
  const agentOnline = status?.agentOnline ?? false;

  function formatKst(iso: string | null | undefined) {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString("ko-KR"); } catch { return iso; }
  }

  return (
    <div
      style={{
        marginBottom: 24,
        border: "1px solid #E5E7EB",
        background: "#F8FAFC",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <span style={{ fontWeight: 900, fontSize: 16 }}>elogis 자동 다운로드</span>
          <span
            style={{
              marginLeft: 10,
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 7px",
              border: "1px solid",
              borderColor: agentOnline ? "#86EFAC" : "#FCA5A5",
              background: agentOnline ? "#F0FDF4" : "#FEF2F2",
              color: agentOnline ? "#15803D" : "#B91C1C",
            }}
          >
            {agentOnline ? "에이전트 온라인" : "에이전트 오프라인"}
          </span>
        </div>
        <button
          onClick={handleTrigger}
          disabled={!agentOnline || !!isBusy || triggering}
          style={{
            height: 36,
            padding: "0 18px",
            border: "1px solid #111827",
            background: !agentOnline || isBusy || triggering ? "#E5E7EB" : "#111827",
            color: !agentOnline || isBusy || triggering ? "#9CA3AF" : "#fff",
            fontWeight: 900,
            fontSize: 13,
            cursor: !agentOnline || isBusy || triggering ? "not-allowed" : "pointer",
          }}
        >
          {triggering ? "요청 중..." : isBusy ? "동기화 중..." : "지금 다운로드"}
        </button>
      </div>

      {status?.latest && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <div style={{ color: "#6B7280", marginBottom: 4 }}>
            최근 실행: {formatKst(status.latest.requested_at)}
            {status.latest.completed_at && ` → ${formatKst(status.latest.completed_at)}`}
          </div>

          {/* 파일별 결과 */}
          {status.latest.results && status.latest.results.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {status.latest.results.map((r) => (
                <span
                  key={r.slotKey}
                  title={r.message}
                  style={{
                    padding: "2px 8px",
                    border: "1px solid",
                    borderColor: r.ok ? "#86EFAC" : "#FCA5A5",
                    background: r.ok ? "#F0FDF4" : "#FEF2F2",
                    color: r.ok ? "#15803D" : "#B91C1C",
                    fontWeight: 700,
                  }}
                >
                  {r.ok ? "✓" : "✗"} {r.label}
                </span>
              ))}
            </div>
          )}

          {/* 에러 */}
          {status.latest.error_text && (
            <div
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#B91C1C",
                fontWeight: 700,
              }}
            >
              {status.latest.error_text}
            </div>
          )}

          {/* 진행 중 로그 */}
          {isBusy && status.latest.log_tail && status.latest.log_tail.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                color: "#1D4ED8",
                fontFamily: "monospace",
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              {status.latest.log_tail.slice(-5).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {!agentOnline && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
          사무실 PC에서 <code style={{ background: "#F3F4F6", padding: "1px 5px" }}>scripts/elogis-agent/start.bat</code> 를 실행하면 에이전트가 활성화됩니다.
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StoreMasterRow = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time?: string;
  address?: string;
};

type SlotType = "store-master" | "generic";

type SlotConfig = {
  key: string;
  label: string;
  description: string;
  accept: string;
  type: SlotType;
  requiredHeaders?: string[]; // 파일 내 필수 컬럼 (없으면 검증 생략)
};

type SlotState = {
  fileObject: File | null;
  fileName: string;
  busy: boolean;
  message: string;
  isError: boolean;
  dragOver: boolean;
  // store-master only
  parsedRows: StoreMasterRow[];
  duplicates: string[];
};

type ServerSlotInfo = { fileName: string; uploadedAt: string; uploaderName?: string } | null;

// ─── Slot Configuration ───────────────────────────────────────────────────────
// 슬롯 추가 시 이 배열에만 항목을 추가하면 됩니다.
// type: "store-master" → Excel 파싱 후 DB 직접 반영 (기존 점포마스터 로직)
// type: "generic"      → 파일 그대로 서버(R2)에 저장

const SLOT_CONFIGS: SlotConfig[] = [
  {
    key: "store-master",
    label: "점포마스터",
    description: "Excel(.xlsx / .xls) — 업로드 시 store_map 테이블에 즉시 반영",
    accept: ".xlsx,.xls",
    type: "store-master",
  },
  {
    key: "product-master",
    label: "상품마스터",
    description: "",
    accept: ".xlsx,.xls",
    type: "generic",
    requiredHeaders: ["화주사코드", "화주사명", "외박스입수", "센터피킹입수"],
  },
  {
    key: "workcenter-product-master",
    label: "작업센터별 취급상품 마스터",
    description: "",
    accept: ".xlsx,.xls",
    type: "generic",
    requiredHeaders: ["센터명", "외박스바코드", "센터피킹입수", "취급여부"],
  },
  {
    key: "cell-management",
    label: "셀관리",
    description: "",
    accept: ".xlsx,.xls",
    type: "generic",
    requiredHeaders: ["셀코드", "셀명", "스테이지여부", "보관설비형태"],
  },
  {
    key: "product-strategy",
    label: "상품별 전략관리",
    description: "",
    accept: ".xlsx,.xls",
    type: "generic",
    requiredHeaders: ["할당전략코드", "보충전략코드", "적치전략코드"],
  },
  {
    key: "inventory-status",
    label: "재고현황",
    description: "",
    accept: ".xlsx,.xls",
    type: "generic",
    requiredHeaders: ["로케이션코드", "로트번호", "입고일자", "재고회전일"],
  },
  {
    key: "product-inventory",
    label: "상품별재고현황",
    description: "",
    accept: ".xlsx,.xls",
    type: "generic",
    requiredHeaders: ["화주사코드", "화주사명", "재고수량", "보류수량"],
  },
];

// ─── Excel Helpers ────────────────────────────────────────────────────────────

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

/** 파일의 첫 번째 시트 헤더 행을 읽어 필수 컬럼 존재 여부를 검증 */
async function validateFileHeaders(
  file: File,
  requiredHeaders: string[]
): Promise<{ valid: boolean; missing: string[] }> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return { valid: false, missing: requiredHeaders };
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as unknown[][];
    if (!rows || rows.length === 0) return { valid: false, missing: requiredHeaders };
    const fileHeaders = rows[0].map((h) => normalizeHeader(h));
    const missing = requiredHeaders.filter((h) => !fileHeaders.includes(normalizeHeader(h)));
    return { valid: missing.length === 0, missing };
  } catch {
    return { valid: false, missing: requiredHeaders };
  }
}

function normalizeStoreCode(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function findDuplicates(rows: StoreMasterRow[]) {
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

async function parseStoreMasterFile(
  file: File
): Promise<{ rows: StoreMasterRow[]; error?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) return { rows: [], error: "엑셀 시트를 읽지 못했습니다." };

    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
    }) as unknown[][];
    if (!rawRows || rawRows.length < 2) return { rows: [], error: "엑셀에 데이터가 없습니다." };

    const headers = rawRows[0].map((cell) => normalizeHeader(cell));
    const idxCar = findHeaderIndex(headers, ["호차번호", "차량번호"]);
    const idxSeq = findHeaderIndex(headers, ["배송순서", "순번"]);
    const idxCode = findHeaderIndex(headers, ["배송처코드", "점포코드"]);
    const idxName = findHeaderIndex(headers, ["배송처명", "점포명"]);
    const idxDue = findHeaderIndex(headers, [
      "납기기준시간",
      "기준시간",
      "납품시간",
      "납품예정시간",
      "delivery_due_time",
    ]);
    const idxAddress = findHeaderIndex(headers, ["주소", "배송처주소", "address"]);

    if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
      return {
        rows: [],
        error:
          "필수 컬럼을 찾지 못했습니다. 호차번호, 배송순서, 배송처코드, 배송처명이 필요합니다.",
      };
    }

    const parsed: StoreMasterRow[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const line = rawRows[i];
      if (!line) continue;
      const car_no = String(line[idxCar] ?? "").trim();
      const seq_no = Number(String(line[idxSeq] ?? "").trim());
      const store_code = normalizeStoreCode(line[idxCode]);
      const store_name = String(line[idxName] ?? "").trim();
      if (!store_code && !store_name && !car_no) continue;
      if (!store_code) continue;
      parsed.push({
        store_code,
        store_name,
        car_no,
        seq_no: Number.isFinite(seq_no) ? seq_no : 0,
        delivery_due_time: idxDue >= 0 ? String(line[idxDue] ?? "").trim() : "",
        address: idxAddress >= 0 ? String(line[idxAddress] ?? "").trim() : "",
      });
    }

    return { rows: parsed };
  } catch (err: any) {
    return { rows: [], error: err?.message ?? "파일을 읽지 못했습니다." };
  }
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INIT_SLOT: SlotState = {
  fileObject: null,
  fileName: "",
  busy: false,
  message: "",
  isError: false,
  dragOver: false,
  parsedRows: [],
  duplicates: [],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatUploadedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR");
  } catch {
    return iso;
  }
}

// ─── Page Component ────────────────────────────────────────────────────────────

export default function FileUploadPage() {
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>(() =>
    Object.fromEntries(SLOT_CONFIGS.map((s) => [s.key, { ...INIT_SLOT }]))
  );
  const [serverFiles, setServerFiles] = useState<Record<string, ServerSlotInfo>>({});
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateSlot = useCallback((key: string, patch: Partial<SlotState>) => {
    setSlotStates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // 서버 파일 상태 로드
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/file-upload");
      const json = await res.json();
      if (json.ok) setServerFiles(json.slots ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // 현재 로그인 사용자 이름 조회
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", session.user.id)
          .maybeSingle();
        if (data?.name) setCurrentUserName(data.name);
      } catch {}
    })();
  }, []);

  // 파일 선택/드롭 시 처리
  const handleFilePick = useCallback(
    async (config: SlotConfig, file: File) => {
      const { key, type } = config;

      if (type === "store-master") {
        updateSlot(key, {
          ...INIT_SLOT,
          fileObject: file,
          fileName: file.name,
          busy: true,
          message: "파일 파싱 중...",
        });

        const { rows, error } = await parseStoreMasterFile(file);

        if (error) {
          updateSlot(key, { busy: false, message: error, isError: true });
          return;
        }

        const dups = findDuplicates(rows);
        const uploadable = rows.filter((r) => !!String(r.car_no ?? "").trim());
        const skipped = rows.length - uploadable.length;

        if (dups.length > 0) {
          updateSlot(key, {
            busy: false,
            parsedRows: rows,
            duplicates: dups,
            message: `중복 점포코드 ${dups.length}개: ${dups.slice(0, 10).join(", ")}${dups.length > 10 ? " ..." : ""} — 중복 정리 후 다시 선택해주세요.`,
            isError: true,
          });
          return;
        }

        updateSlot(key, {
          busy: false,
          parsedRows: rows,
          duplicates: [],
          message: `파싱 완료 — 총 ${rows.length}건 / 업로드 가능 ${uploadable.length}건${skipped > 0 ? ` / 차량번호 없음 ${skipped}건 제외` : ""}`,
          isError: false,
        });
      } else {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (ext !== "xlsx" && ext !== "xls") {
          updateSlot(key, {
            ...INIT_SLOT,
            message: `엑셀 파일만 업로드할 수 있습니다. (.xlsx / .xls)`,
            isError: true,
          });
          return;
        }

        // 필수 컬럼 검증
        if (config.requiredHeaders && config.requiredHeaders.length > 0) {
          updateSlot(key, { ...INIT_SLOT, fileName: file.name, busy: true, message: "파일 형식 확인 중..." });
          const { valid, missing } = await validateFileHeaders(file, config.requiredHeaders);
          if (!valid) {
            updateSlot(key, {
              ...INIT_SLOT,
              message: `올바른 파일이 아닙니다. 누락된 컬럼: ${missing.join(", ")}`,
              isError: true,
            });
            return;
          }
        }

        updateSlot(key, {
          ...INIT_SLOT,
          fileObject: file,
          fileName: file.name,
          message: `${file.name} 선택됨`,
          isError: false,
        });
      }
    },
    [updateSlot]
  );

  // 업로드 실행
  const handleUpload = useCallback(
    async (config: SlotConfig) => {
      const { key, type } = config;
      const state = slotStates[key];
      if (!state.fileName || state.busy) return;

      if (type === "store-master") {
        const uploadable = state.parsedRows.filter((r) => !!String(r.car_no ?? "").trim());
        const skipped = state.parsedRows.length - uploadable.length;

        if (uploadable.length === 0) {
          updateSlot(key, {
            message: "업로드 가능한 데이터가 없습니다. 차량번호가 있는 행이 없습니다.",
            isError: true,
          });
          return;
        }

        if (state.duplicates.length > 0) {
          updateSlot(key, {
            message: "중복 점포코드가 있어 업로드할 수 없습니다.",
            isError: true,
          });
          return;
        }

        if (
          !confirm(
            `점포마스터 DB 반영\n\n총 ${uploadable.length}건 반영 / 차량번호 없음 ${skipped}건 제외\n\n※ 이번 파일에 없는 기존 점포는 DB에서 삭제됩니다.`
          )
        )
          return;

        updateSlot(key, { busy: true, message: "DB 반영 중..." });

        try {
          const res = await fetch("/api/admin/store-master/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: uploadable }),
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.message ?? "DB 반영 실패");

          // 메타데이터 저장 (마지막 업로더 이름 포함)
          await fetch("/api/admin/file-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save-meta",
              slotKey: key,
              fileName: state.fileName,
              ...(currentUserName ? { uploaderName: currentUserName } : {}),
            }),
          });

          const now = new Date().toISOString();
          updateSlot(key, {
            busy: false,
            message: `업로드 완료 — ${state.fileName} (${json.count}건 반영 / ${json.deleted}건 삭제)`,
            isError: false,
          });
          setServerFiles((prev) => ({
            ...prev,
            [key]: { fileName: state.fileName, uploadedAt: now, uploaderName: currentUserName || undefined },
          }));
        } catch (err: any) {
          updateSlot(key, {
            busy: false,
            message: err?.message ?? "업로드 실패",
            isError: true,
          });
        }
      } else {
        const file = state.fileObject;
        if (!file) {
          updateSlot(key, { message: "파일을 다시 선택해주세요.", isError: true });
          return;
        }

        updateSlot(key, { busy: true, message: "업로드 URL 발급 중..." });

        try {
          // 1) 서버에서 presigned PUT URL 발급 + 기존 파일 삭제
          const urlRes = await fetch("/api/admin/file-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "upload-url",
              slotKey: key,
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
            }),
          });
          const urlJson = await urlRes.json();
          if (!urlJson.ok) throw new Error(urlJson.message ?? "URL 발급 실패");

          updateSlot(key, { message: "R2에 업로드 중..." });

          // 2) 브라우저에서 R2로 직접 PUT (서버 body 제한 우회)
          const putRes = await fetch(urlJson.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!putRes.ok) throw new Error(`R2 업로드 실패 (${putRes.status})`);

          // 3) 서버에 메타데이터 저장
          await fetch("/api/admin/file-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "confirm",
              slotKey: key,
              fileName: file.name,
              ...(currentUserName ? { uploaderName: currentUserName } : {}),
            }),
          });

          const now = new Date().toISOString();
          updateSlot(key, {
            busy: false,
            message: `업로드 완료 — ${file.name}`,
            isError: false,
          });
          setServerFiles((prev) => ({
            ...prev,
            [key]: { fileName: file.name, uploadedAt: now, uploaderName: currentUserName || undefined },
          }));
        } catch (err: any) {
          updateSlot(key, {
            busy: false,
            message: err?.message ?? "업로드 실패",
            isError: true,
          });
        }
      }
    },
    [slotStates, updateSlot, currentUserName]
  );

  // 슬롯 초기화
  const handleReset = useCallback(
    (key: string) => {
      updateSlot(key, { ...INIT_SLOT });
      const input = inputRefs.current[key];
      if (input) input.value = "";
    },
    [updateSlot]
  );

  // 드래그 이벤트 팩토리
  const dragHandlers = useCallback(
    (config: SlotConfig) => ({
      onDragEnter(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!slotStates[config.key].busy) updateSlot(config.key, { dragOver: true });
      },
      onDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!slotStates[config.key].busy) updateSlot(config.key, { dragOver: true });
      },
      onDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        updateSlot(config.key, { dragOver: false });
      },
      async onDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        updateSlot(config.key, { dragOver: false });
        if (slotStates[config.key].busy) return;
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        await handleFilePick(config, file);
      },
    }),
    [slotStates, updateSlot, handleFilePick]
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontWeight: 900, fontSize: 32, letterSpacing: -0.4 }}>파일 업로드 관리</h1>
      <p style={{ marginTop: 8, color: "#6B7280", fontSize: 14 }}>
        슬롯별로 파일을 업로드합니다. 같은 슬롯에 새 파일을 올리면 기존 파일이 교체됩니다.
      </p>

      <div style={{ marginTop: 24 }}>
        <ElogisSyncPanel />
      </div>

      <div
        style={{
          marginTop: 24,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        {SLOT_CONFIGS.map((config) => {
          const state = slotStates[config.key];
          const serverFile = serverFiles[config.key] ?? null;
          const canUpload =
            !state.busy &&
            !!state.fileName &&
            (config.type === "store-master"
              ? state.parsedRows.length > 0 && state.duplicates.length === 0
              : !!state.fileObject);

          return (
            <SlotCard
              key={config.key}
              config={config}
              state={state}
              serverFile={serverFile}
              canUpload={canUpload}
              inputRef={(el) => {
                inputRefs.current[config.key] = el;
              }}
              onFilePick={(file) => handleFilePick(config, file)}
              onUpload={() => handleUpload(config)}
              onReset={() => handleReset(config.key)}
              dragHandlers={dragHandlers(config)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── DownloadButton Component ─────────────────────────────────────────────────

function DownloadButton({ slotKey }: { slotKey: string }) {
  const [loading, setLoading] = React.useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/file-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download-url", slotKey, fileName: "_" }),
      });
      const json = await res.json();
      if (json.ok && json.downloadUrl) {
        const a = document.createElement("a");
        a.href = json.downloadUrl;
        a.download = "";
        a.click();
      } else {
        alert(json.message ?? "다운로드 URL 발급 실패");
      }
    } catch {
      alert("다운로드 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      style={{
        fontSize: 11,
        padding: "2px 8px",
        background: loading ? "#E5E7EB" : "#EFF6FF",
        color: loading ? "#9CA3AF" : "#1D4ED8",
        border: "1px solid #BFDBFE",
        cursor: loading ? "not-allowed" : "pointer",
        fontWeight: 700,
      }}
    >
      {loading ? "..." : "다운로드"}
    </button>
  );
}

// ─── SlotCard Component ───────────────────────────────────────────────────────

type DragHandlers = {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
};

function SlotCard({
  config,
  state,
  serverFile,
  canUpload,
  inputRef,
  onFilePick,
  onUpload,
  onReset,
  dragHandlers,
}: {
  config: SlotConfig;
  state: SlotState;
  serverFile: ServerSlotInfo;
  canUpload: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onFilePick: (file: File) => void;
  onUpload: () => void;
  onReset: () => void;
  dragHandlers: DragHandlers;
}) {
  const localInputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (state.busy) return;
    localInputRef.current?.click();
  };

  return (
    <div
      style={{
        flex: "1 1 460px",
        border: "1px solid #E5E7EB",
        background: "#fff",
        padding: 18,
      }}
    >
      {/* 슬롯 헤더 */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontWeight: 900, fontSize: 16 }}>{config.label}</span>
          {config.type === "store-master" && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: "#EFF6FF",
                color: "#1D4ED8",
                border: "1px solid #BFDBFE",
                padding: "1px 6px",
              }}
            >
              DB 반영
            </span>
          )}
        </div>
        {serverFile?.uploaderName && (
          <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>
            {serverFile.uploaderName}
          </span>
        )}
      </div>
      {/* 현재 서버 파일 (generic 슬롯만) */}
      {config.type === "generic" && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            background: "#F8FAFC",
            border: "1px solid #E5E7EB",
            fontSize: 12,
            color: "#374151",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700 }}>현재 서버 파일</div>
            {serverFile && (
              <DownloadButton slotKey={config.key} />
            )}
          </div>
          {serverFile ? (
            <>
              <div style={{ marginTop: 2 }}>{serverFile.fileName}</div>
              <div style={{ marginTop: 2, color: "#9CA3AF" }}>
                {formatUploadedAt(serverFile.uploadedAt)}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 2, color: "#9CA3AF" }}>없음</div>
          )}
        </div>
      )}

      {/* 파일 선택 드롭존 */}
      <div
        onClick={openPicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openPicker();
        }}
        {...dragHandlers}
        style={{
          border: state.dragOver ? "2px solid #2563EB" : "2px dashed #CBD5E1",
          padding: "12px 14px",
          cursor: state.busy ? "not-allowed" : "pointer",
          background: state.dragOver ? "#EFF6FF" : "#F8FAFC",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          transition: "all 120ms ease",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>
            {state.dragOver
              ? "여기에 놓으면 선택됩니다"
              : state.fileName
              ? "선택된 파일"
              : "파일 선택"}
          </div>
          <div
            style={{
              marginTop: 2,
              color: state.fileName ? "#111827" : "#9CA3AF",
              fontSize: 12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 240,
            }}
            title={state.fileName || "클릭 또는 드래그앤드롭"}
          >
            {state.fileName || "클릭 또는 드래그앤드롭"}
          </div>
        </div>

        <div
          style={{
            height: 34,
            padding: "0 14px",
            border: "1px solid #374151",
            background: "#374151",
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {state.fileName ? "바꾸기" : "선택"}
        </div>
      </div>

      <input
        ref={(el) => {
          localInputRef.current = el;
          inputRef(el);
        }}
        type="file"
        accept={config.accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFilePick(file);
        }}
        style={{ display: "none" }}
        disabled={state.busy}
      />

      {/* 버튼 영역 */}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button
          onClick={onUpload}
          disabled={!canUpload}
          style={{
            flex: 1,
            height: 38,
            border: "1px solid #111827",
            background: canUpload ? "#111827" : "#E5E7EB",
            color: canUpload ? "#fff" : "#9CA3AF",
            fontWeight: 900,
            fontSize: 13,
            cursor: canUpload ? "pointer" : "not-allowed",
          }}
        >
          {state.busy
            ? "처리 중..."
            : config.type === "store-master"
            ? "DB 반영"
            : "업로드"}
        </button>

        <button
          onClick={onReset}
          disabled={state.busy || !state.fileName}
          style={{
            height: 38,
            padding: "0 14px",
            border: "1px solid #CBD5E1",
            background: "#fff",
            fontWeight: 700,
            fontSize: 12,
            cursor: state.busy || !state.fileName ? "not-allowed" : "pointer",
            color: state.busy || !state.fileName ? "#9CA3AF" : "#374151",
          }}
        >
          초기화
        </button>
      </div>

      {/* 메시지 */}
      {state.message && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            background: state.isError ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${state.isError ? "#FCA5A5" : "#86EFAC"}`,
            color: state.isError ? "#B91C1C" : "#15803D",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
