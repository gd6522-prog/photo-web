"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { InboundRow } from "@/app/api/admin/inbound-status/route";

// ─── 유틸 ────────────────────────────────────────────────────────────────────
async function getAdminToken() {
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (token) return token;
    await new Promise((r) => window.setTimeout(r, 250));
  }
  throw new Error("로그인 세션이 없습니다.");
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

/** 날짜 문자열 → YYYYMMDD (하이픈/슬래시/점 제거) */
function normalizeDate(s: string): string {
  return s.replace(/\D/g, "").slice(0, 8);
}

/** YYYYMMDD → YYYY.MM.DD */
function fmtDate(s: string): string {
  const d = normalizeDate(s);
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  return s || "-";
}

/** KST 기준 오늘 날짜 YYYYMMDD */
function kstToday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return (
    kst.getUTCFullYear().toString() +
    String(kst.getUTCMonth() + 1).padStart(2, "0") +
    String(kst.getUTCDate()).padStart(2, "0")
  );
}

/**
 * 내일 날짜 YYYYMMDD (KST 기준)
 * 토요일이면 월요일(+3일), 일요일이면 월요일(+2일)
 */
function nextWorkdayDate(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1));
  const dow = d.getUTCDay(); // 0=일, 6=토
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2); // 토→월
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // 일→월
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabel(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00+09:00`);
  return `${fmtDate(yyyymmdd)}(${DOW_KO[d.getDay()]})`;
}

// ─── Canvas 직접 드로잉 방식 클립보드 복사 ──────────────────────────────────
type SummaryItem = { label: string; count: number; ord_price: number };

async function copySummaryAsImage(
  title: string,
  dateLbl: string,
  summaryRows: SummaryItem[],
  total: { count: number; ord_price: number },
  noTobacco: { count: number; ord_price: number },
) {
  const hasWrite = !!(navigator.clipboard as { write?: unknown })?.write;
  const hasItem = typeof (window as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";
  if (!hasWrite || !hasItem) throw new Error("이 브라우저는 이미지 복사를 지원하지 않습니다.");

  const DPR   = 2;
  const PAD   = 14;
  const ROW_H = 26;
  const HEAD_H = 36;
  const TITLE_H = 38;
  const FOOT_H = 28;

  // 컬럼 폭 계산
  const COL_LABEL = 110;
  const COL_COUNT = 52;
  const COL_PRICE = 110;
  const W = PAD + COL_LABEL + COL_COUNT + COL_PRICE + PAD;
  const H = TITLE_H + HEAD_H + ROW_H * summaryRows.length + FOOT_H * 2 + PAD;

  const canvas = document.createElement("canvas");
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  // 배경
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── 타이틀 행 ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f4f8fc";
  ctx.fillRect(0, 0, W, TITLE_H);
  ctx.strokeStyle = "#d9e6ef";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, TITLE_H); ctx.lineTo(W, TITLE_H); ctx.stroke();

  ctx.fillStyle = "#103b53";
  ctx.font = `bold 13px -apple-system, "Malgun Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(title, PAD, TITLE_H / 2);

  ctx.fillStyle = "#557186";
  ctx.font = `11px -apple-system, "Malgun Gothic", sans-serif`;
  const dateW = ctx.measureText(dateLbl).width;
  ctx.fillText(dateLbl, W - PAD - dateW, TITLE_H / 2);

  // ── 헤더 행 ────────────────────────────────────────────────────────────────
  const headerY = TITLE_H;
  ctx.fillStyle = "#eef5fb";
  ctx.fillRect(0, headerY, W, HEAD_H);
  ctx.strokeStyle = "#d9e6ef";
  ctx.beginPath(); ctx.moveTo(0, headerY + HEAD_H); ctx.lineTo(W, headerY + HEAD_H); ctx.stroke();

  ctx.fillStyle = "#103b53";
  ctx.font = `bold 12px -apple-system, "Malgun Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  const hMid = headerY + HEAD_H / 2;
  ctx.fillText("작업구분", PAD, hMid);
  drawRight(ctx, "건수",    PAD + COL_LABEL + COL_COUNT,        hMid, 12, "#103b53", true);
  drawRight(ctx, "발주금액", PAD + COL_LABEL + COL_COUNT + COL_PRICE, hMid, 12, "#103b53", true);

  // ── 데이터 행 ──────────────────────────────────────────────────────────────
  summaryRows.forEach((r, i) => {
    const y = TITLE_H + HEAD_H + i * ROW_H;
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#f8fbfd";
    ctx.fillRect(0, y, W, ROW_H);
    ctx.strokeStyle = "#eef3f7";
    ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(W, y + ROW_H); ctx.stroke();

    const mid = y + ROW_H / 2;
    ctx.fillStyle = "#0f2940";
    ctx.font = `bold 12px -apple-system, "Malgun Gothic", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(r.label, PAD, mid);
    drawRight(ctx, fmt(r.count),                    PAD + COL_LABEL + COL_COUNT,        mid, 12, "#374151");
    drawRight(ctx, fmt(Math.round(r.ord_price)),    PAD + COL_LABEL + COL_COUNT + COL_PRICE, mid, 12, "#1D4ED8", true);
  });

  // ── 합계 행 ────────────────────────────────────────────────────────────────
  const footY = TITLE_H + HEAD_H + ROW_H * summaryRows.length;
  ctx.fillStyle = "#f4f8fc";
  ctx.fillRect(0, footY, W, FOOT_H);
  ctx.strokeStyle = "#d9e6ef";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, footY); ctx.lineTo(W, footY); ctx.stroke();
  ctx.lineWidth = 1;

  const fMid = footY + FOOT_H / 2;
  ctx.fillStyle = "#103b53";
  ctx.font = `bold 13px -apple-system, "Malgun Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText("합계", PAD, fMid);
  drawRight(ctx, fmt(total.count),                  PAD + COL_LABEL + COL_COUNT,        fMid, 13, "#113247", true);
  drawRight(ctx, fmt(Math.round(total.ord_price)),  PAD + COL_LABEL + COL_COUNT + COL_PRICE, fMid, 13, "#0f2940", true);

  // ── 담배제외 행 ────────────────────────────────────────────────────────────
  const foot2Y = footY + FOOT_H;
  ctx.fillStyle = "#eef4f9";
  ctx.fillRect(0, foot2Y, W, FOOT_H);
  ctx.strokeStyle = "#d9e6ef";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, foot2Y); ctx.lineTo(W, foot2Y); ctx.stroke();

  const f2Mid = foot2Y + FOOT_H / 2;
  ctx.fillStyle = "#103b53";
  ctx.font = `bold 13px -apple-system, "Malgun Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText("담배제외", PAD, f2Mid);
  drawRight(ctx, fmt(noTobacco.count),                  PAD + COL_LABEL + COL_COUNT,        f2Mid, 13, "#113247", true);
  drawRight(ctx, fmt(Math.round(noTobacco.ord_price)),  PAD + COL_LABEL + COL_COUNT + COL_PRICE, f2Mid, 13, "#0f2940", true);

  // 외곽선
  ctx.strokeStyle = "#d9e6ef";
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했습니다.");

  if (!document.hasFocus()) { window.focus(); await new Promise((r) => setTimeout(r, 50)); }
  const item = new (window as { ClipboardItem: new (a: Record<string, Blob>) => unknown }).ClipboardItem({ "image/png": blob });
  await (navigator.clipboard as unknown as { write: (a: unknown[]) => Promise<void> }).write([item]);
}

function drawRight(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  midY: number,
  size: number,
  color: string,
  bold = false,
) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? "bold " : ""}${size}px -apple-system, "Malgun Gothic", sans-serif`;
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  ctx.fillText(text, rightX - w, midY);
}

// ─── 정렬 ────────────────────────────────────────────────────────────────────
type SortKey = "inb_ect_date" | "inb_date" | "suppr_nm" | "item_cd" | "item_nm" |
  "inb_status" | "shortage_status" | "ord_qty" | "inb_qty" | "miss_qty";
type SortDir = "asc" | "desc";

// ─── 상태 배지 ────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  "입고완료": { bg: "#DCFCE7", color: "#15803D" },
  "입고예정": { bg: "#DBEAFE", color: "#1D4ED8" },
  "미입고":   { bg: "#FEF9C3", color: "#A16207" },
  "결품":     { bg: "#FEE2E2", color: "#DC2626" },
};

function Badge({ label }: { label: string }) {
  const s = STATUS_COLOR[label] ?? { bg: "#F1F5F9", color: "#475569" };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {label || "-"}
    </span>
  );
}

function pgBtn(disabled: boolean, active = false): React.CSSProperties {
  return {
    padding: "4px 10px", fontSize: 13, borderRadius: 5, border: "1px solid #E2E8F0",
    background: active ? "#1D4ED8" : disabled ? "#F8FAFC" : "#fff",
    color: active ? "#fff" : disabled ? "#CBD5E1" : "#374151",
    cursor: disabled ? "default" : "pointer", fontWeight: active ? 700 : 400,
  };
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function InboundPage() {
  const [rows, setRows]               = useState<InboundRow[]>([]);
  const [worktypeMap, setWorktypeMap] = useState<Record<string, string>>({});
  const [uploadedAt, setUploadedAt]   = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  // 테이블 필터/정렬/페이지
  const [search, setSearch]         = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("inb_ect_date");
  const [sortDir, setSortDir]       = useState<SortDir>("asc");
  const [showTable, setShowTable]   = useState(false);
  const [page, setPage]             = useState(1);
  const PAGE_SIZE = 50;

  const targetDate  = useMemo(() => nextWorkdayDate(), []);

  // ── 로드 ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const token = await getAdminToken();
        const res = await fetch("/api/admin/inbound-status", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) { setError("데이터를 불러오지 못했습니다."); return; }
        const data = await res.json() as { ok: boolean; rows?: InboundRow[]; uploadedAt?: string | null; worktypeMap?: Record<string, string> };
        setRows(data.rows ?? []);
        setUploadedAt(data.uploadedAt ?? null);
        setWorktypeMap(data.worktypeMap ?? {});
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 복사 메시지 자동 클리어
  useEffect(() => {
    if (!copyMsg) return;
    const t = window.setTimeout(() => setCopyMsg(""), 2000);
    return () => window.clearTimeout(t);
  }, [copyMsg]);

  // ── 내일 기준 요약 ────────────────────────────────────────────────────────
  // 조건: 입고예정일 = 내일, 입고상태 = "입고예정", 결품상태 ≠ "완납" · "완전결품"
  const EXCLUDE_SHORTAGE = new Set(["완납", "완전결품"]);

  const summaryRows = useMemo(() => {
    const target = rows.filter((r) => {
      if (normalizeDate(r.inb_ect_date) !== targetDate) return false;
      if (r.inb_status !== "입고예정") return false;
      if (EXCLUDE_SHORTAGE.has(r.shortage_status)) return false;
      return true;
    });
    if (!target.length) return [];

    const groups = new Map<string, { count: number; ord_price: number; ord_qty: number }>();
    for (const r of target) {
      const key = worktypeMap[r.item_cd] || "미분류";
      const g = groups.get(key) ?? { count: 0, ord_price: 0, ord_qty: 0 };
      g.count     += 1;
      g.ord_price += r.ord_price;
      g.ord_qty   += r.ord_qty;
      groups.set(key, g);
    }

    const ORDER = ["박스수기", "박스존1", "이너존A", "슬라존A", "경량존A", "이형존A", "담배존", "담배수기", "미분류", "유가증권"];
    return [...groups.entries()]
      .filter(([label]) => label !== "공병존")
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => {
        const ai = ORDER.indexOf(a.label);
        const bi = ORDER.indexOf(b.label);
        if (ai === -1 && bi === -1) return a.label.localeCompare(b.label, "ko");
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
  }, [rows, targetDate, worktypeMap]);

  const summaryTotal = useMemo(() => summaryRows.reduce(
    (acc, r) => ({ count: acc.count + r.count, ord_price: acc.ord_price + r.ord_price, ord_qty: acc.ord_qty + r.ord_qty }),
    { count: 0, ord_price: 0, ord_qty: 0 }
  ), [summaryRows]);

  const summaryNoTobacco = useMemo(() => summaryRows
    .filter(r => r.label !== "담배존" && r.label !== "담배수기")
    .reduce(
      (acc, r) => ({ count: acc.count + r.count, ord_price: acc.ord_price + r.ord_price, ord_qty: acc.ord_qty + r.ord_qty }),
      { count: 0, ord_price: 0, ord_qty: 0 }
    ), [summaryRows]);

  // ── 복사 ─────────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    setCopying(true);
    setCopyMsg("");
    try {
      await copySummaryAsImage(
        "입고예정 파트별 발주 현황",
        dateLabel(targetDate),
        summaryRows,
        summaryTotal,
        summaryNoTobacco,
      );
      setCopyMsg("복사 완료");
    } catch (e: unknown) {
      setCopyMsg((e as Error)?.message ?? "복사 실패");
    } finally {
      setCopying(false);
    }
  };

  // ── 테이블 데이터 ─────────────────────────────────────────────────────────
  const dateOptions = useMemo(() => {
    const dates = [...new Set(rows.map((r) => normalizeDate(r.inb_ect_date)).filter(Boolean))].sort();
    return dates;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dateFilter && normalizeDate(r.inb_ect_date) !== dateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.item_cd.toLowerCase().includes(q) || r.item_nm.toLowerCase().includes(q) || r.suppr_nm.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, dateFilter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      let cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const tableTotals = useMemo(() => ({
    ord_qty:  filtered.reduce((s, r) => s + r.ord_qty, 0),
    inb_qty:  filtered.reduce((s, r) => s + r.inb_qty, 0),
    miss_qty: filtered.reduce((s, r) => s + r.miss_qty, 0),
  }), [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page]);

  // 필터/정렬 변경 시 첫 페이지로
  useEffect(() => { setPage(1); }, [search, dateFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#CBD5E1", marginLeft: 3 }}>↕</span>;
    return <span style={{ color: "#3B82F6", marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const TABLE_COLS: Array<{ key: SortKey; label: string; align?: "right" | "center" }> = [
    { key: "inb_ect_date",    label: "입고예정일" },
    { key: "inb_date",        label: "입고일" },
    { key: "suppr_nm",        label: "공급거래처" },
    { key: "item_cd",         label: "상품코드" },
    { key: "item_nm",         label: "상품명" },
    { key: "inb_status",      label: "입고상태",  align: "center" },
    { key: "shortage_status", label: "결품상태",  align: "center" },
    { key: "ord_qty",         label: "발주수량",  align: "right" },
    { key: "inb_qty",         label: "입고수량",  align: "right" },
    { key: "miss_qty",        label: "결품수량",  align: "right" },
  ];

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "28px 24px", maxWidth: 1300, margin: "0 auto" }}>
      {/* 페이지 타이틀 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: 0 }}>입고예정</h1>
        {uploadedAt && (
          <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>파일 기준: {uploadedAt}</p>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <style>{`@keyframes ib-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid #E2E8F0", borderTopColor: "#1D4ED8", animation: "ib-spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 14, color: "#64748B", fontWeight: 600 }}>데이터 불러오는 중...</div>
        </div>
      ) : error ? (
        <div style={{ padding: 48, textAlign: "center", color: "#EF4444", fontSize: 14 }}>{error}</div>
      ) : (
        <>
          {/* ── 요약 카드 (메인 기능) ─────────────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              border: "1px solid #bdd0de",
              borderRadius: 0,
              background: "#fff",
              boxShadow: "0 16px 34px rgba(2,32,46,0.10)",
              overflow: "hidden",
              display: "inline-block",
              minWidth: 320,
            }}>
              {/* 카드 헤더 (화면용) */}
              <div style={{
                padding: "12px 14px",
                borderBottom: "1px solid #d9e6ef",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fff",
              }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 15, color: "#103b53" }}>파트별 발주 현황</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#557186" }}>
                    입고예정일: {rows.length > 0 ? dateLabel(targetDate) : "-"}
                    {Object.keys(worktypeMap).length === 0 && rows.length > 0 && (
                      <span style={{ marginLeft: 8, color: "#F59E0B", fontWeight: 700 }}>⚠ 상품별전략관리 파일 없음</span>
                    )}
                  </div>
                </div>
                {/* 복사 버튼 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <button
                    onClick={handleCopy}
                    disabled={copying || summaryRows.length === 0}
                    style={{
                      height: 30, padding: "0 12px", borderRadius: 4,
                      border: "1px solid #b9cddd",
                      background: copying || summaryRows.length === 0 ? "#e5edf3" : "#ffffff",
                      color:      copying || summaryRows.length === 0 ? "#90a4b4" : "#103b53",
                      cursor:     copying || summaryRows.length === 0 ? "default" : "pointer",
                      fontWeight: 950, fontSize: 12, whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {copying ? "복사중" : "복사"}
                  </button>
                  {copyMsg && (
                    <div style={{ fontSize: 11.5, color: copyMsg === "복사 완료" ? "#0f766e" : "#b91c1c", fontWeight: 800 }}>
                      {copyMsg}
                    </div>
                  )}
                </div>
              </div>

              {/* 카드 바디 */}
              <div style={{ padding: 10 }}>
                {rows.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
                    <div style={{ fontSize: 14, color: "#64748B", fontWeight: 600 }}>입고예정 파일이 없습니다.</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>파일 업로드 설정에서 입고예정 파일을 업로드해주세요.</div>
                  </div>
                ) : summaryRows.length === 0 ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                    {dateLabel(targetDate)} 조건에 맞는 데이터가 없습니다.
                  </div>
                ) : (
                  <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 240 }}>
                    <thead>
                      <tr style={{ background: "#eef5fb" }}>
                        <th style={{ textAlign: "left",  padding: "5px 10px", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap", borderBottom: "1px solid #d9e6ef" }}>작업구분</th>
                        <th style={{ textAlign: "right", padding: "5px 10px", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap", borderBottom: "1px solid #d9e6ef" }}>건수</th>
                        <th style={{ textAlign: "right", padding: "5px 10px", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap", borderBottom: "1px solid #d9e6ef" }}>발주금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((r, i) => (
                        <tr key={r.label} style={{ background: i % 2 === 0 ? "#fff" : "#f8fbfd", borderTop: "1px solid #eef3f7" }}>
                          <td style={{ padding: "5px 10px", fontWeight: 700, color: "#0f2940", whiteSpace: "nowrap" }}>{r.label}</td>
                          <td style={{ padding: "5px 10px", textAlign: "right", color: "#374151", fontVariantNumeric: "tabular-nums" }}>{fmt(r.count)}</td>
                          <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#1D4ED8", fontVariantNumeric: "tabular-nums" }}>{fmt(Math.round(r.ord_price))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #d9e6ef", background: "#f4f8fc" }}>
                        <td style={{ padding: "5px 10px", fontWeight: 950, color: "#103b53" }}>합계</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 900, color: "#113247", fontVariantNumeric: "tabular-nums" }}>{fmt(summaryTotal.count)}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 950, color: "#0f2940", fontVariantNumeric: "tabular-nums" }}>{fmt(Math.round(summaryTotal.ord_price))}</td>
                      </tr>
                      <tr style={{ borderTop: "1px solid #d9e6ef", background: "#eef4f9" }}>
                        <td style={{ padding: "5px 10px", fontWeight: 950, color: "#103b53" }}>담배제외</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 900, color: "#113247", fontVariantNumeric: "tabular-nums" }}>{fmt(summaryNoTobacco.count)}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 950, color: "#0f2940", fontVariantNumeric: "tabular-nums" }}>{fmt(Math.round(summaryNoTobacco.ord_price))}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── 상세 테이블 ──────────────────────────────────────────────── */}
          <>
            {/* 조회 버튼 / 필터 */}
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  style={{ padding: "7px 12px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13, color: "#374151", background: "#fff", cursor: "pointer" }}
                >
                  <option value="">전체 날짜</option>
                  {dateOptions.map((d) => (
                    <option key={d} value={d}>{fmtDate(d)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="상품코드 / 상품명 / 공급거래처"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: "7px 12px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13, width: 260, outline: "none" }}
                />
                <button
                  onClick={() => { setShowTable(true); setPage(1); }}
                  style={{
                    padding: "7px 18px", background: "#1D4ED8", border: "none",
                    borderRadius: 7, fontSize: 13, color: "#fff", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  조회
                </button>
                {showTable && (search || dateFilter) && (
                  <button
                    onClick={() => { setSearch(""); setDateFilter(""); setPage(1); }}
                    style={{ padding: "7px 14px", background: "#F1F5F9", border: "none", borderRadius: 7, fontSize: 12, color: "#475569", cursor: "pointer", fontWeight: 600 }}
                  >
                    초기화
                  </button>
                )}
              </div>

              {showTable && (
                <>
                  {/* 요약 바 */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    {[
                      { label: "조회 건수", value: `${fmt(filtered.length)}건`, color: "#1E293B" },
                      { label: "발주수량",  value: fmt(tableTotals.ord_qty),    color: "#1D4ED8" },
                      { label: "입고수량",  value: fmt(tableTotals.inb_qty),    color: "#15803D" },
                      { label: "결품수량",  value: fmt(tableTotals.miss_qty),   color: tableTotals.miss_qty > 0 ? "#DC2626" : "#94A3B8" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "#fff", border: "1px solid #E8EDF2", borderRadius: 8, padding: "7px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#64748B" }}>{s.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* 테이블 */}
                  <div style={{ border: "1px solid #E8EDF2", borderRadius: 10, background: "#fff", overflow: "auto", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          {TABLE_COLS.map(({ key, label, align }) => (
                            <th
                              key={key}
                              onClick={() => handleSort(key)}
                              style={{ textAlign: align ?? "left", padding: "10px 13px", borderBottom: "2px solid #E8EDF2", fontSize: 12, fontWeight: 700, color: sortKey === key ? "#1E293B" : "#64748B", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                            >
                              {label}<SortIcon col={key} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paged.length === 0 ? (
                          <tr><td colSpan={TABLE_COLS.length} style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>검색 결과가 없습니다.</td></tr>
                        ) : paged.map((row, i) => (
                          <tr key={`${row.item_cd}-${row.inb_ect_date}-${i}`} style={{ background: normalizeDate(row.inb_ect_date) === targetDate ? (i % 2 === 0 ? "#EFF6FF" : "#E8F2FF") : (i % 2 === 0 ? "#fff" : "#FAFBFC") }}>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, whiteSpace: "nowrap", fontWeight: 600, color: normalizeDate(row.inb_ect_date) === targetDate ? "#1D4ED8" : "#374151" }}>{fmtDate(row.inb_ect_date)}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, whiteSpace: "nowrap", color: "#94A3B8" }}>{row.inb_date ? fmtDate(row.inb_date) : "-"}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151" }}>{row.suppr_nm || "-"}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>{row.item_cd}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#0F172A" }}>{row.item_nm}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", textAlign: "center" }}><Badge label={row.inb_status} /></td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", textAlign: "center" }}><Badge label={row.shortage_status} /></td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, textAlign: "right", color: "#1D4ED8", fontWeight: 600 }}>{row.ord_qty > 0 ? fmt(row.ord_qty) : "-"}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, textAlign: "right", color: "#15803D", fontWeight: 600 }}>{row.inb_qty > 0 ? fmt(row.inb_qty) : "-"}</td>
                            <td style={{ padding: "9px 13px", borderBottom: "1px solid #F1F5F9", fontSize: 13, textAlign: "right", fontWeight: 700, color: row.miss_qty > 0 ? "#DC2626" : "#94A3B8" }}>{row.miss_qty > 0 ? fmt(row.miss_qty) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14 }}>
                      <button onClick={() => setPage(1)}          disabled={page === 1}          style={pgBtn(page === 1)}>{"<<"}</button>
                      <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}        style={pgBtn(page === 1)}>{"<"}</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === "…" ? (
                            <span key={`e${i}`} style={{ fontSize: 13, color: "#94A3B8", padding: "0 4px" }}>…</span>
                          ) : (
                            <button key={p} onClick={() => setPage(p as number)} style={pgBtn(false, p === page)}>{p}</button>
                          )
                        )}
                      <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} style={pgBtn(page === totalPages)}>{">"}</button>
                      <button onClick={() => setPage(totalPages)}   disabled={page === totalPages} style={pgBtn(page === totalPages)}>{">>"}</button>
                      <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 4 }}>{page} / {totalPages}</span>
                    </div>
                  )}
                </>
              )}
            </>
        </>
      )}
    </div>
  );
}
