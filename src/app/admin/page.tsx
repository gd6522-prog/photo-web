// src/app/admin/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toBlob as toImageBlob } from "html-to-image";
import { supabase } from "@/lib/supabase";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";
import { getNoticeBoardDef, NOTICE_BOARD_ALL, NOTICE_BOARD_DEFS, type NoticeBoardFilter, type NoticePost } from "@/lib/notice-board";
import {
  CALENDAR_EVENT_TYPE_BADGE,
  calendarEventBadgeBackground,
  calendarEventBadgeBorderColor,
  CALENDAR_EVENT_TYPE_LABEL,
  compareCalendarEventType,
  dominantCalendarEventType,
  isMixedCalendarEventTypes,
  parseCalendarEventType,
  summarizeCalendarEventTypes,
  type CalendarEventType,
} from "@/lib/calendar-event-type";

type EventRow = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  memo: string | null;
  event_type: CalendarEventType;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type HolidayRow = {
  date: string; // YYYY-MM-DD
  name: string;
  source: string | null;
};

const CARD_MIN_H = 0;
const WEATHER_MIN_H = 0;
const HOME_NOTICE_CACHE_KEY = "admin-home-notices-v1";
const HOME_WEATHER_CACHE_KEY = "admin-home-weather-v1";
const HOME_OUTBOUND_CACHE_KEY = "admin-home-outbound-v1";
const HOME_PENDING_SUMMARY_CACHE_KEY = "admin-home-pending-summary-v1";

// 달력 크기는 유지하고, 공지 영역을 좌측으로 더 붙이기 위해 컬럼 폭 조정
const LEFT_COL_W = 290;

// 왼쪽 달력과 가운데 공지사항 간격 고정
const COL_GAP = "8px";
const ROW_GAP = "8px";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function kstTodayYYYYMMDD() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}
function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}
function startWeekdayOfMonth(year: number, month1to12: number) {
  return new Date(`${year}-${pad2(month1to12)}-01T00:00:00+09:00`).getDay();
}
function addDaysYMD(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}
function dowKo(dateYMD: string) {
  const d = new Date(`${dateYMD}T00:00:00+09:00`);
  const map = ["일", "월", "화", "수", "목", "금", "토"];
  return map[d.getDay()] ?? "";
}
function holidayDisplayName(ymd: string, holidaysByDate: Record<string, HolidayRow>) {
  const h = holidaysByDate[ymd];
  if (!h) return null;
  if (h.name === "대체공휴일") {
    for (let i = 1; i <= 3; i++) {
      const prev = holidaysByDate[addDaysYMD(ymd, -i)];
      if (prev && prev.name !== "대체공휴일") return `${prev.name}(대체공휴일)`;
    }
  }
  return h.name;
}

type Cell = { day: number; weekday: number; ymd: string; inCurrentMonth: boolean };

type Notice = NoticePost;

type WeatherAPI = {
  ok: boolean;
  locationName: string;
  updatedAt: string | null;

  today: {
    date: string;
    currentTemp: number | null;
    feelsLike: number | null;
    weatherCode: number | null;
    weatherText: string;
    precipProbNow: number | null;
    max: number | null;
    min: number | null;
    pm10: number | null;
    pm25: number | null;
  };

  next7: Array<{
    date: string;
    dow: string;
    precipProbMax: number | null;
    max: number | null;
    min: number | null;
    weatherCode: number | null;
    weatherText: string;
  }>;

  message?: string;
};

type VehicleProductRow = {
  car_no: string;
  store_name: string;
  delivery_date: string;
  work_type: string;
  product_code: string;
  product_name: string;
  facility_type: string;
  original_qty: number;
  current_qty: number;
  assigned_qty: number;
  confirmed_qty: number;
  center_unit: number;
};

type VehicleSnapshot = {
  fileName: string;
  uploadedAt?: string;
  productRows: VehicleProductRow[];
};

function getFeelsLikeStatus(feelsLike: number | null) {
  if (feelsLike == null) {
    return {
      label: "-",
      borderColor: "#94a3b8",
      background: "linear-gradient(135deg,#cbd5e1 0%,#94a3b8 100%)",
      boxShadow: "0 10px 20px rgba(100,116,139,0.22)",
      textColor: "#ffffff",
      titleColor: "rgba(255,255,255,0.92)",
    };
  }

  if (feelsLike < 31) {
    return {
      label: "안전",
      borderColor: "#3b82f6",
      background: "linear-gradient(135deg,#60a5fa 0%,#2563eb 100%)",
      boxShadow: "0 10px 20px rgba(37,99,235,0.24)",
      textColor: "#ffffff",
      titleColor: "rgba(255,255,255,0.92)",
    };
  }

  if (feelsLike < 33) {
    return {
      label: "관심",
      borderColor: "#84cc16",
      background: "linear-gradient(135deg,#a3e635 0%,#65a30d 100%)",
      boxShadow: "0 10px 20px rgba(101,163,13,0.24)",
      textColor: "#ffffff",
      titleColor: "rgba(255,255,255,0.92)",
    };
  }

  if (feelsLike < 35) {
    return {
      label: "주의",
      borderColor: "#eab308",
      background: "linear-gradient(135deg,#fde047 0%,#eab308 100%)",
      boxShadow: "0 10px 20px rgba(234,179,8,0.24)",
      textColor: "#3f3100",
      titleColor: "rgba(63,49,0,0.84)",
    };
  }

  if (feelsLike < 38) {
    return {
      label: "경고",
      borderColor: "#f97316",
      background: "linear-gradient(135deg,#fb923c 0%,#ea580c 100%)",
      boxShadow: "0 10px 20px rgba(234,88,12,0.24)",
      textColor: "#ffffff",
      titleColor: "rgba(255,255,255,0.92)",
    };
  }

  return {
    label: "위험",
    borderColor: "#b91c1c",
    background: "linear-gradient(135deg,#dc2626 0%,#991b1b 100%)",
    boxShadow: "0 10px 20px rgba(153,27,27,0.28)",
    textColor: "#ffffff",
    titleColor: "rgba(255,255,255,0.92)",
  };
}

function hardToLogin() {
  window.location.replace("/login");
}

function qtyBase(row: VehicleProductRow) {
  const assigned = row.assigned_qty || row.confirmed_qty || row.current_qty || row.original_qty || 0;
  if (assigned <= 0) return 0;
  if (row.center_unit > 0) return assigned / row.center_unit;
  return assigned;
}

function normalizeWorkTypeLabel(value: string) {
  return String(value || "").trim() || "-";
}

function normalizeSimpleText(value: string) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function getWorkTypeGroupLabel(row: VehicleProductRow) {
  const workTypeText = normalizeSimpleText(row.work_type);
  const productCode = String(row.product_code || "").trim();
  const productNameText = normalizeSimpleText(row.product_name);

  if (productCode === "8809169711091" || productNameText.includes("옐로우)올데이워터생수펫2l")) return "올데이2L생수";
  if (productCode === "8809482500938" || productNameText.includes("노브랜드)미네랄워터펫2l(qr)")) return "노브랜드2L생수";

  const text = workTypeText;
  if (text.includes("박스수기")) return "박스수기";
  if (text.includes("박스존1")) return "박스존1";
  if (text.includes("이너존a")) return "이너존A";
  if (text.includes("슬라존a")) return "슬라존A";
  if (text.includes("경량존a")) return "경량존A";
  if (text.includes("이형존")) return "이형존A";
  if (text.includes("담배수기")) return "담배수기";
  if (text.includes("담배존")) return "담배존";
  if (text.includes("유가증권")) return "유가증권";
  return null;
}

function getOutboundCategory(row: VehicleProductRow) {
  const storeName = normalizeSimpleText(row.store_name);
  const carNo = String(row.car_no || "").replace(/\s+/g, "");

  if (storeName.includes("고덕삼성캠퍼스점")) return "campus" as const;
  if (carNo === "1899") return "newStore" as const;
  return "general" as const;
}

function formatDeliveryDateLabel(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return String(value || "").trim() || "-";
}

function formatOutboundCount(value: number) {
  return value === 0 ? "-" : value.toLocaleString("ko-KR");
}

function getHazardSummaryBadge(openCount: number, waitingCount: number) {
  if (openCount > 0) {
    return {
      text: `위험요인 미처리 ${openCount}건`,
      dot: "#DC2626",
      glow: "0 0 0 3px rgba(220,38,38,0.15)",
    };
  }

  if (waitingCount > 0) {
    return {
      text: `위험요인 처리대기 ${waitingCount}건`,
      dot: "#F97316",
      glow: "0 0 0 3px rgba(249,115,22,0.18)",
    };
  }

  return {
    text: "위험요인 미처리 0건",
    dot: "#16A34A",
    glow: "0 0 0 3px rgba(22,163,74,0.15)",
  };
}

function getWeatherTextStyle(text: string | null | undefined) {
  const length = String(text ?? "").trim().length;
  if (length >= 8) {
    return { fontSize: 14, lineHeight: 1.1 };
  }
  if (length >= 6) {
    return { fontSize: 16, lineHeight: 1.1 };
  }
  return { fontSize: 18, lineHeight: 1.1 };
}

function readHomeCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeHomeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function monthCacheKey(year: number, month: number) {
  return `admin-home-calendar-${year}-${pad2(month)}`;
}

function shiftYearMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month - 1 + delta, 1);
  return { y: next.getFullYear(), m: next.getMonth() + 1 };
}

async function copyElementAsImageToClipboard(element: HTMLElement) {
  const hasClipboardWrite = !!(navigator.clipboard as { write?: unknown })?.write;
  const hasClipboardItem = typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";
  if (!hasClipboardWrite || !hasClipboardItem) {
    throw new Error("현재 브라우저는 이미지 클립보드를 지원하지 않습니다.");
  }

  if (!document.hasFocus()) {
    window.focus();
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const pngBlob = await toImageBlob(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    filter: (node) => !(node instanceof HTMLElement && node.dataset.copyHide === "true"),
  });
  if (!pngBlob) {
    throw new Error("카드 이미지를 만들지 못했습니다.");
  }

  const item = new (window as unknown as { ClipboardItem: new (arg: Record<string, Blob>) => unknown }).ClipboardItem({
    "image/png": pngBlob,
  });
  await (navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> }).write([item]);
}

async function fetchVehicleSnapshotForHome() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("세션이 없습니다.");

  const response = await fetch("/api/admin/vehicles/current?includeSnapshot=1", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    snapshotUrl?: string | null;
    snapshot?: VehicleSnapshot | null;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "단품별 데이터를 불러오지 못했습니다.");
  }

  if (payload.snapshot) return payload.snapshot;

  if (!payload.snapshotUrl) return null;
  const snapshot = (await fetch(payload.snapshotUrl, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))) as VehicleSnapshot | null;
  return snapshot;
}

function Card({
  title,
  subtitle,
  right,
  children,
  minHeight,
  bodyPadding,
  headerBorderless,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  minHeight?: number;
  bodyPadding?: number;
  headerBorderless?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #bdd0de",
        borderRadius: 0,
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 16px 34px rgba(2,32,46,0.10)",
        width: "100%",
        minHeight: minHeight ?? undefined,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: headerBorderless ? "12px 10px 6px 14px" : "12px 14px",
          borderBottom: headerBorderless ? "none" : "1px solid #d9e6ef",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "#fff",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, fontSize: 15, color: "#103b53", letterSpacing: 0.1 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 3, fontSize: 12, color: "#557186" }}>{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div style={{ padding: bodyPadding ?? 10, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

/** -------- 날씨 아이콘 (SVG) -------- */
function WeatherIcon({ code, size = 30 }: { code: number | null; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    xmlns: "http://www.w3.org/2000/svg",
    style: { display: "block" as const },
  };

  const c = code ?? -1;
  const isClear = c === 0;
  const isPartly = c === 1 || c === 2;
  const isFog = c === 45 || c === 48;
  const isDrizzle = c >= 51 && c <= 57;
  const isRain = (c >= 61 && c <= 67) || (c >= 80 && c <= 82);
  const isSnow = (c >= 71 && c <= 77) || (c >= 85 && c <= 86);
  const isThunder = c >= 95;

  const sun = (
    <>
      <circle cx="32" cy="32" r="11" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2.5" />
      {[...Array(8)].map((_, i) => {
        const a = (Math.PI * 2 * i) / 8;
        const x1 = 32 + Math.cos(a) * 18;
        const y1 = 32 + Math.sin(a) * 18;
        const x2 = 32 + Math.cos(a) * 25;
        const y2 = 32 + Math.sin(a) * 25;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />;
      })}
    </>
  );

  const cloud = (
    <path
      d="M16 40c0-5 4-9 9-9 2 0 3 0 5 1 2-4 6-7 11-7 7 0 13 6 13 13 6 0 10 4 10 9s-5 9-10 9H24c-5 0-8-4-8-8 0-3 0-5 0-8z"
      fill="#DCE3EC"
      stroke="#AAB8C8"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  );

  if (isClear) return <svg {...common}>{sun}</svg>;

  if (isPartly) {
    return (
      <svg {...common}>
        <g transform="translate(-7,-6) scale(0.86)">{sun}</g>
        {cloud}
      </svg>
    );
  }

  if (isFog) {
    return (
      <svg {...common}>
        {cloud}
        <path d="M14 50h36" stroke="#9AA9B8" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 56h30" stroke="#9AA9B8" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (isSnow) {
    return (
      <svg {...common}>
        {cloud}
        {[22, 32, 42].map((x, i) => (
          <g key={i} transform={`translate(${x} 52)`}>
            <circle cx="0" cy="0" r="2.3" fill="#60A5FA" />
            <path d="M0 -4v8M-4 0h8M-3 -3l6 6M-3 3l6-6" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    );
  }

  if (isThunder) {
    return (
      <svg {...common}>
        {cloud}
        <path d="M33 44l-6 11h7l-3 9 11-15h-7l4-8z" fill="#F59E0B" stroke="#D97706" strokeWidth="1.2" />
      </svg>
    );
  }

  if (isDrizzle || isRain) {
    return (
      <svg {...common}>
        {cloud}
        {[22, 32, 42].map((x, i) => (
          <path key={i} d={`M${x} 49l-3 9`} stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
        ))}
      </svg>
    );
  }

  return <svg {...common}>{cloud}</svg>;
}

/** -------- 공지(메인): 리스트형 (최대 6개 페이징) -------- */
function NoticeMainCard() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notice[]>([]);
  const [err, setErr] = useState("");
  const [activeBoard, setActiveBoard] = useState<NoticeBoardFilter>(NOTICE_BOARD_ALL);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const load = async (options?: { keepVisible?: boolean }) => {
    setErr("");
    if (!options?.keepVisible) setLoading(true);
    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sessData.session?.access_token;
      if (!token) throw new Error("Missing Authorization Bearer token");

      const res = await fetch("/api/admin/notices/list?limit=40", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "공지 불러오기 실패");

      const list = (json.items ?? []) as Notice[];
      setItems(list);
      setPage(1);
      writeHomeCache(HOME_NOTICE_CACHE_KEY, { items: list });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = readHomeCache<{ items?: Notice[] }>(HOME_NOTICE_CACHE_KEY);
    if (cached?.items?.length) {
      setItems(cached.items);
      setLoading(false);
      void load({ keepVisible: true });
      return;
    }
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    if (activeBoard === NOTICE_BOARD_ALL) return items;
    return items.filter((item) => item.board_key === activeBoard);
  }, [activeBoard, items]);
  const filteredTotal = filteredItems.length;
  const maxPage = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const canPrev = safePage > 1;
  const canNext = safePage < maxPage;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPage]);

  const pageItems = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(from, from + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR");

  return (
    <Card
      title="화성센터 게시판"
      minHeight={CARD_MIN_H}
      bodyPadding={8}
      headerBorderless
      right={
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: !canPrev ? "not-allowed" : "pointer",
              color: !canPrev ? "#cbd5e1" : "#94a3b8",
              fontSize: 20,
              lineHeight: 1,
            }}
            aria-label="prev"
            title="이전"
          >
            {"<"}
          </button>
          <button
            onClick={() => canNext && setPage((p) => p + 1)}
            disabled={!canNext}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: !canNext ? "not-allowed" : "pointer",
              color: !canNext ? "#cbd5e1" : "#64748b",
              fontSize: 20,
              lineHeight: 1,
            }}
            aria-label="next"
            title="다음"
          >
            {">"}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 0, flexWrap: "wrap", margin: "0 0 6px", borderBottom: "1px solid #e2e8f0" }}>
        <button
          onClick={() => {
            setActiveBoard(NOTICE_BOARD_ALL);
            setPage(1);
          }}
          style={{
            height: 40,
            padding: "0 12px",
            borderRadius: 0,
            border: "none",
            borderBottom: activeBoard === NOTICE_BOARD_ALL ? "2px solid #111827" : "2px solid transparent",
            background: "transparent",
            color: activeBoard === NOTICE_BOARD_ALL ? "#111827" : "#64748b",
            fontWeight: 900,
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          전체
        </button>
        {NOTICE_BOARD_DEFS.map((board) => (
          <button
            key={board.key}
            onClick={() => {
              setActiveBoard(board.key);
              setPage(1);
            }}
            style={{
              height: 40,
              padding: "0 12px",
              borderRadius: 0,
              border: "none",
              borderBottom: activeBoard === board.key ? `2px solid ${board.tone.text}` : "2px solid transparent",
              background: "transparent",
              color: activeBoard === board.key ? board.tone.text : "#64748b",
              fontWeight: 900,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {board.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#6B7280", fontSize: 14 }}>불러오는 중...</div>
      ) : err ? (
        <div style={{ color: "#B91C1C", fontSize: 14 }}>{err}</div>
      ) : filteredTotal === 0 ? (
        <div
          style={{
            background: "#f8fbfc",
            padding: "22px 0",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ color: "#6B7280", fontSize: 14, padding: "0 4px" }}>등록된 게시글이 없습니다.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={`/admin/notice/boards/write?board=${activeBoard === NOTICE_BOARD_ALL ? "notice" : activeBoard}`}
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 4,
                border: "1px solid #111827",
                background: "#111827",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                fontWeight: 950,
                fontSize: 13,
                color: "white",
                boxShadow: "0 8px 18px rgba(16,59,83,0.20)",
              }}
            >
              글쓰기
            </Link>
            <Link
              href={`/admin/notice/boards?board=${activeBoard === NOTICE_BOARD_ALL ? "notice" : activeBoard}`}
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              열기
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {pageItems.map((n, idx) => (
              <Link
                key={n.id}
                href={`/admin/notice/boards/${n.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                }}
              >
                <div style={{ padding: "10px 6px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 14,
                        color: n.is_pinned ? "#ea580c" : "#111827",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={n.title}
                    >
                      {n.is_pinned ? `[${getNoticeBoardDef(n.board_key).shortLabel}] ` : ""}
                      {n.title}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 12,
                        color: "#6B7280",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ whiteSpace: "nowrap", color: "#64748b" }}>{new Date(n.updated_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      <span style={{ color: "#94a3b8" }}>{n.author_name ?? "-"}</span>
                      <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                        {getNoticeBoardDef(n.board_key).label}
                      </span>
                    </div>
                  </div>

                  <div style={{ opacity: 0.35, fontSize: 16, color: "#94a3b8", lineHeight: "22px" }}>{">"}</div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: "auto" }}>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                color: "#6B7280",
              }}
            >
              <div>{filteredTotal}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    background: safePage === 1 ? "#f8fafc" : "#fff",
                    cursor: safePage === 1 ? "not-allowed" : "pointer",
                    fontWeight: 950,
                    fontSize: 12,
                  }}
                >
                  처음
                </button>
                <button
                  onClick={() => setPage(maxPage)}
                  disabled={safePage === maxPage}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    background: safePage === maxPage ? "#f8fafc" : "#fff",
                    cursor: safePage === maxPage ? "not-allowed" : "pointer",
                    fontWeight: 950,
                    fontSize: 12,
                  }}
                >
                  끝
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** -------- DPS 작업현황 -------- */

const LC_TP_NAMES: Record<string, string> = {
  "01": "박스수기", "02": "소분", "03": "행사존A", "04": "유가증권",
  "05": "담배존",  "06": "이형존A", "08": "주류존", "12": "소분음료",
  "13": "슬라존", "15": "경량존", "17": "이너존", "20": "담배수기",
  "21": "박스존", "25": "이형존B", "48": "공병존",
};
const LC_TP_ORDER = ["21","17","13","15","05","01","20","06","25","04","08","12","02","03","48"];

type DpsZone = { done: number; total: number; minPendingCar: string | null };
type DpsSummary = { dsTotal: number; loadedCount: number; zones: Record<string, DpsZone> };
type DpsStatusData = { rows: DpsSummary; scrapedAt: string | null };

function DpsProgressCard() {
  const [data, setData] = useState<DpsStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLabel, setRefreshLabel] = useState("새로고침");
  const [carRefTimes, setCarRefTimes] = useState<Record<string, { hour: number; minute: number }>>({});
  const savedDateRef = React.useRef<string | null>(null);
  const allDoneRef = React.useRef(false);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCarRefTimes = React.useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/admin/app-settings?key=dps_car_reference_times", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { ok: boolean; value?: Record<string, { hour: number; minute: number }> };
      if (j.ok && j.value) setCarRefTimes(j.value);
    } catch { /* ignore */ }
  }, []);

  const saveCompletion = React.useCallback(async (workDate: string, completedAt: string | null, snapshot: DpsSummary) => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      await fetch("/api/admin/dps-completion", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ work_date: workDate, completed_at: completedAt, snapshot }),
      });
    } catch { /* ignore */ }
  }, []);

  const readR2 = React.useCallback(async () => {
    if (allDoneRef.current) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/internal/dps-status", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (j.ok) {
        setData(j);
        const summary = j.rows as DpsSummary;
        const zs = summary?.zones ?? {};
        const activeCodes = Object.keys(zs).filter((c) => zs[c].total > 0);
        const allDone = activeCodes.length > 0 && activeCodes.every((c) => zs[c].done >= zs[c].total);
        if (allDone) {
          const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
          const todayStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
          if (savedDateRef.current !== todayStr) {
            savedDateRef.current = todayStr;
            void saveCompletion(todayStr, j.scrapedAt ?? null, summary);
          }
          if (!allDoneRef.current) {
            allDoneRef.current = true;
            if (intervalRef.current !== null) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        } else {
          allDoneRef.current = false;
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [saveCompletion]);

  useEffect(() => {
    allDoneRef.current = false;
    readR2();
    void loadCarRefTimes();
    intervalRef.current = setInterval(readR2, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [readR2, loadCarRefTimes]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;

      // 에이전트에 DPS 스크래핑 요청
      setRefreshLabel("요청 중...");
      const startRes = await fetch("/api/admin/elogis-sync/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetSlot: "dps-status" }),
      });
      const startJson = await startRes.json().catch(() => ({ ok: false }));
      if (!startJson.ok && !startJson.alreadyQueued) {
        await readR2();
        return;
      }

      // 작업 완료까지 폴링 (최대 3분)
      setRefreshLabel("스크래핑 중...");
      const deadline = Date.now() + 3 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await fetch("/api/admin/elogis-sync/status").then((r) => r.json()).catch(() => ({}));
        if (!st.running && !st.pending) break;
      }

      // 새 데이터 읽기
      setRefreshLabel("데이터 읽는 중...");
      await readR2();
    } finally {
      setRefreshing(false);
      setRefreshLabel("새로고침");
    }
  };

  const fmtTime = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")} 기준`;
  };

  const summary = data?.rows as DpsSummary | null;
  const zones = summary?.zones ?? {};
  const sortedCodes = LC_TP_ORDER.filter((c) => zones[c]);
  Object.keys(zones).forEach((c) => { if (!LC_TP_ORDER.includes(c)) sortedCodes.push(c); });

  const activeCodes = sortedCodes.filter((c) => zones[c]?.total > 0);
  const allDone = activeCodes.length > 0 && activeCodes.every((c) => zones[c].done >= zones[c].total);

  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const nowMin = nowKst.getUTCHours() * 60 + nowKst.getUTCMinutes();

  function getBarColor(pct: number, pendingCar: string | null): string {
    const ref = pendingCar ? carRefTimes[pendingCar] : null;
    if (ref) {
      const diff = ref.hour * 60 + ref.minute - nowMin;
      if (diff < 0) return "#EF4444";
      if (diff <= 10) return "#F59E0B";
      return "#2563EB";
    }
    return pct >= 80 ? "#16A34A" : pct >= 50 ? "#2563EB" : "#F59E0B";
  }

  return (
    <Card
      title="작업파트별 진행현황"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {data?.scrapedAt && (
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{fmtTime(data.scrapedAt)}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "3px 10px", fontSize: 11, fontWeight: 700,
              background: refreshing ? "#e2ebf3" : "#0f2940", color: refreshing ? "#94a3b8" : "#fff",
              border: "none", borderRadius: 4, cursor: refreshing ? "default" : "pointer",
            }}
          >
            {refreshLabel}
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>로딩...</div>
      ) : allDone ? (
        <div style={{ padding: "20px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#16A34A", letterSpacing: 0.5 }}>금일 작업 종료</div>
          {data?.scrapedAt && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#6B7280" }}>{fmtTime(data.scrapedAt)}</div>
          )}
        </div>
      ) : sortedCodes.length === 0 ? (
        <div style={{ padding: "20px 12px", color: "#9CA3AF", fontSize: 13, textAlign: "center" }}>
          데이터 없음
          <div style={{ marginTop: 6, fontSize: 11 }}>elogis-agent에서 DPS 작업현황을 스크래핑하면 표시됩니다.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0" }}>
          {sortedCodes.map((code) => {
            const z = zones[code];
            const name = LC_TP_NAMES[code] ?? `작업구분 ${code}`;
            const pct = z.total > 0 ? Math.min(100, Math.round((z.done / z.total) * 100)) : 0;
            const barColor = getBarColor(pct, z.minPendingCar);
            return (
              <div key={code} style={{ padding: "4px 8px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #E2EBF3" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#113247", whiteSpace: "nowrap", minWidth: 52 }}>{name}</span>
                  <div style={{ flex: 1, height: 7, background: "#E2EBF3", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, color: pct >= 100 ? "#16A34A" : "#64748B", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {pct >= 100 ? "작업완료" : z.minPendingCar ? `${z.minPendingCar}호차` : "완료"}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: barColor, whiteSpace: "nowrap", minWidth: 28, textAlign: "right" }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** -------- 날씨 -------- */
type DustLevel = { label: string; color: string; bg: string };

function dustLevelPm10(v: number | null): DustLevel {
  if (v == null) return { label: "-", color: "#6B7280", bg: "#F3F4F6" };
  if (v <= 30) return { label: "좋음", color: "#166534", bg: "#DCFCE7" };
  if (v <= 80) return { label: "보통", color: "#1D4ED8", bg: "#DBEAFE" };
  if (v <= 150) return { label: "나쁨", color: "#B45309", bg: "#FEF3C7" };
  return { label: "매우나쁨", color: "#B91C1C", bg: "#FEE2E2" };
}

function dustLevelPm25(v: number | null): DustLevel {
  if (v == null) return { label: "-", color: "#6B7280", bg: "#F3F4F6" };
  if (v <= 15) return { label: "좋음", color: "#166534", bg: "#DCFCE7" };
  if (v <= 35) return { label: "보통", color: "#1D4ED8", bg: "#DBEAFE" };
  if (v <= 75) return { label: "나쁨", color: "#B45309", bg: "#FEF3C7" };
  return { label: "매우나쁨", color: "#B91C1C", bg: "#FEE2E2" };
}

function WeatherCard() {
  const [loading, setLoading] = useState(true);
  const [w, setW] = useState<WeatherAPI | null>(null);

  const load = async (options?: { keepVisible?: boolean }) => {
    if (!options?.keepVisible) setLoading(true);
    try {
      const res = await fetch("/api/admin/weather", { cache: "no-store" });
      const json = (await res.json()) as WeatherAPI;
      setW(json);
      writeHomeCache(HOME_WEATHER_CACHE_KEY, json);
    } catch (e: any) {
      setW({
        ok: false,
        locationName: "경기도 화성시 양감면",
        updatedAt: null,
        today: {
          date: "",
          currentTemp: null,
          feelsLike: null,
          weatherCode: null,
          weatherText: "불러오기 실패",
          precipProbNow: null,
          max: null,
          min: null,
          pm10: null,
          pm25: null,
        },
        next7: [],
        message: e?.message ?? String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = readHomeCache<WeatherAPI>(HOME_WEATHER_CACHE_KEY);
    if (cached) {
      setW(cached);
      setLoading(false);
      void load({ keepVisible: true });
      return;
    }
    void load();
  }, []);

  const fmtMD = (d: string) => {
    const [, m, dd] = d.split("-").map(Number);
    return `${m}.${pad2(dd)}`;
  };
  const pm10Level = dustLevelPm10(w?.today.pm10 ?? null);
  const pm25Level = dustLevelPm25(w?.today.pm25 ?? null);
  const feelsLikeStatus = getFeelsLikeStatus(w?.today.feelsLike ?? null);
  const weatherTextStyle = getWeatherTextStyle(w?.today.weatherText);

  return (
    <Card
      title="오늘의 날씨"
      subtitle="경기도 화성시 양감면"
      minHeight={WEATHER_MIN_H}
      right={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: -2, gap: 4 }}>
          <button
            onClick={() => void load()}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 4,
              border: "1px solid #0e7490",
              background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
              color: "white",
              cursor: "pointer",
              fontWeight: 950,
              fontSize: 12,
              boxShadow: "0 8px 18px rgba(16,59,83,0.20)",
            }}
          >
            새로고침
          </button>
          <div style={{ fontSize: 11.5, color: "#4f6b80", lineHeight: 1.1 }}>
            업데이트: {w?.updatedAt ? new Date(w.updatedAt).toLocaleString("ko-KR") : "-"}
          </div>
        </div>
      }
    >
      <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중...</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                  <WeatherIcon code={w?.today.weatherCode ?? null} size={56} />
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 52, fontWeight: 950, color: "#111827", lineHeight: 1 }}>
                      {w?.today.currentTemp == null ? "-" : `${Math.round(w.today.currentTemp)}°`}
                    </div>
                    <div
                      style={{
                        ...weatherTextStyle,
                        fontWeight: 950,
                        color: "#111827",
                        whiteSpace: "normal",
                        wordBreak: "keep-all",
                        lineHeight: 1.15,
                      }}
                    >
                      {w?.today.weatherText ?? "-"}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    minWidth: 104,
                    borderRadius: 14,
                    border: `1px solid ${feelsLikeStatus.borderColor}`,
                    background: feelsLikeStatus.background,
                    boxShadow: feelsLikeStatus.boxShadow,
                    padding: "12px 10px 14px",
                    minHeight: 108,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 950, color: feelsLikeStatus.titleColor, letterSpacing: 0.3 }}>
                    체감온도
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 26,
                      lineHeight: 1,
                      fontWeight: 950,
                      color: feelsLikeStatus.textColor,
                      textShadow: feelsLikeStatus.textColor === "#ffffff" ? "0 1px 2px rgba(0,0,0,0.22)" : "none",
                    }}
                  >
                    {w?.today.feelsLike == null ? "-" : `${Math.round(w.today.feelsLike)}°`}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 18, fontWeight: 1000, color: feelsLikeStatus.titleColor, lineHeight: 1.05, letterSpacing: 0.2 }}>
                    {feelsLikeStatus.label}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12.5, color: "#374151" }}>
                  강수확률:{" "}
                  <b style={{ color: "#111827" }}>
                    {w?.today.precipProbNow == null ? "-" : `${w.today.precipProbNow}%`}
                  </b>
                </div>
                <div style={{ fontSize: 12.5, color: "#374151" }}>
                  최고/최저:{" "}
                  <b style={{ color: "#111827" }}>
                    {w?.today.max == null ? "-" : `${Math.round(w.today.max)}°`} /{" "}
                    {w?.today.min == null ? "-" : `${Math.round(w.today.min)}°`}
                  </b>
                </div>
              </div>

              {!w?.ok && w?.message ? <div style={{ fontSize: 12, color: "#B91C1C" }}>{w.message}</div> : null}
            </div>

            {/* 주간예보 (D+7, 오늘 제외) */}
            <div style={{ marginTop: 14, borderTop: "1px solid #d9e6ef", paddingTop: 12 }}>
              <div style={{ fontWeight: 950, fontSize: 12.5, color: "#103b53", marginBottom: 8 }}>
                주간예보 (D+7, 오늘 제외)
              </div>

              <div style={{ overflow: "hidden", borderRadius: 0, border: "1px solid #d9e6ef", background: "#fff" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "46px 66px 1fr 56px 56px",
                    background: "#fff",
                    padding: "9px 10px",
                    fontSize: 11.5,
                    fontWeight: 950,
                    color: "#35556b",
                    alignItems: "center",
                    minHeight: 34,
                  }}
                >
                  <div>요일</div>
                  <div>날짜</div>
                  <div>강수</div>
                  <div style={{ textAlign: "right" }}>최저</div>
                  <div style={{ textAlign: "right" }}>최고</div>
                </div>

                {(w?.next7 ?? []).map((d) => (
                  <div
                    key={d.date}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "46px 66px 1fr 56px 56px",
                      padding: "8px 10px",
                      borderTop: "1px solid #e2edf5",
                      fontSize: 12.5,
                      alignItems: "center",
                      minHeight: 34,
                    }}
                  >
                    <div style={{ fontWeight: 950, color: d.dow === "일" ? "#EF4444" : "#113247" }}>{d.dow}</div>
                    <div style={{ color: "#587387" }}>{fmtMD(d.date)}</div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <WeatherIcon code={d.weatherCode ?? null} size={18} />
                      <div style={{ fontWeight: 950, color: "#113247" }}>
                        {d.precipProbMax == null ? "-" : `${d.precipProbMax}%`}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", color: "#2563EB", fontWeight: 950 }}>
                      {d.min == null ? "-" : `${Math.round(d.min)}°`}
                    </div>
                    <div style={{ textAlign: "right", color: "#DC2626", fontWeight: 950 }}>
                      {d.max == null ? "-" : `${Math.round(d.max)}°`}
                    </div>
                  </div>
                ))}

                {(w?.next7 ?? []).length === 0 ? (
                  <div style={{ padding: 12, color: "#587387", fontSize: 13 }}>예보 데이터를 불러오지 못했습니다.</div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid #d9e6ef", paddingTop: 12 }}>
              <div style={{ fontWeight: 950, fontSize: 12.5, color: "#103b53", marginBottom: 8 }}>대기질</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ border: "1px solid #d3e1eb", borderRadius: 0, padding: "9px 10px", background: "#fff" }}>
                  <div style={{ fontSize: 11.5, color: "#567284", fontWeight: 700 }}>미세먼지 (PM10)</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ color: "#113247", fontSize: 13 }}>{w?.today.pm10 == null ? "-" : `${Math.round(w.today.pm10)} μg/m³`}</b>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 900,
                        color: pm10Level.color,
                        background: pm10Level.bg,
                      }}
                    >
                      {pm10Level.label}
                    </span>
                  </div>
                </div>
                <div style={{ border: "1px solid #d3e1eb", borderRadius: 0, padding: "9px 10px", background: "#fff" }}>
                  <div style={{ fontSize: 11.5, color: "#567284", fontWeight: 700 }}>초미세먼지 (PM2.5)</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ color: "#113247", fontSize: 13 }}>{w?.today.pm25 == null ? "-" : `${Math.round(w.today.pm25)} μg/m³`}</b>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 900,
                        color: pm25Level.color,
                        background: pm25Level.bg,
                      }}
                    >
                      {pm25Level.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </Card>
  );
}

function WorkTypeOutboundCard() {
  type SummaryRow = { label: string; general: number; newStore: number; campus: number; total: number; isSubtotal?: boolean };
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [err, setErr] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const cardCaptureRef = useRef<HTMLDivElement | null>(null);

  const load = async (options?: { keepVisible?: boolean }) => {
    if (!options?.keepVisible) setLoading(true);
    setErr("");
    try {
      const snapshot = await fetchVehicleSnapshotForHome();
      const nextDeliveryDate = snapshot?.productRows?.find((row) => String(row.delivery_date || "").trim())?.delivery_date ?? "";
      setDeliveryDate(nextDeliveryDate);

      const orderedLabels = ["박스수기", "박스존1", "올데이2L생수", "노브랜드2L생수", "이너존A", "슬라존A", "경량존A", "이형존A", "담배존", "담배수기", "유가증권"] as const;
      const grouped = new Map<string, SummaryRow>();
      for (const label of orderedLabels) {
        grouped.set(label, { label, general: 0, newStore: 0, campus: 0, total: 0 });
      }

      for (const row of snapshot?.productRows ?? []) {
        const label = getWorkTypeGroupLabel(row);
        if (!label) continue;
        const qty = qtyBase(row);
        if (qty <= 0) continue;

        const current = grouped.get(label) ?? { label, general: 0, newStore: 0, campus: 0, total: 0 };
        const category = getOutboundCategory(row);
        if (category === "campus") current.campus += qty;
        else if (category === "newStore") current.newStore += qty;
        else current.general += qty;
        current.total += qty;
        grouped.set(label, current);
      }

      const baseRows = orderedLabels.map((label) => grouped.get(label)!).filter(Boolean);
      const boxLabels = new Set(["박스수기", "박스존1", "올데이2L생수", "노브랜드2L생수"]);
      const boxSubtotal = baseRows
        .filter((row) => boxLabels.has(row.label))
        .reduce(
          (acc, row) => {
            acc.general += row.general;
            acc.newStore += row.newStore;
            acc.campus += row.campus;
            acc.total += row.total;
            return acc;
          },
          { label: "박스합계", general: 0, newStore: 0, campus: 0, total: 0, isSubtotal: true } as SummaryRow,
        );
      const tobaccoLabels = new Set(["담배존", "담배수기"]);
      const tobaccoSubtotal = baseRows
        .filter((row) => tobaccoLabels.has(row.label))
        .reduce(
          (acc, row) => {
            acc.general += row.general;
            acc.newStore += row.newStore;
            acc.campus += row.campus;
            acc.total += row.total;
            return acc;
          },
          { label: "담배합계", general: 0, newStore: 0, campus: 0, total: 0, isSubtotal: true } as SummaryRow,
        );

      const nextRows: SummaryRow[] = [];
      for (const row of baseRows) {
        nextRows.push(row);
        if (row.label === "노브랜드2L생수") {
          nextRows.push(boxSubtotal);
        }
        if (row.label === "담배수기") {
          nextRows.push(tobaccoSubtotal);
        }
      }
      setRows(nextRows);
      writeHomeCache(HOME_OUTBOUND_CACHE_KEY, { rows: nextRows, deliveryDate: nextDeliveryDate });
    } catch (e: any) {
      setRows([]);
      setErr(e?.message ?? "작업파트별 출고배수를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = readHomeCache<{ rows?: SummaryRow[]; deliveryDate?: string }>(HOME_OUTBOUND_CACHE_KEY);
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setDeliveryDate(cached.deliveryDate ?? "");
      setLoading(false);
      void load({ keepVisible: true });
      return;
    }
    void load();
  }, []);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const sumGeneral = rows.reduce((sum, row) => sum + (row.isSubtotal ? 0 : row.general), 0);
  const sumNewStore = rows.reduce((sum, row) => sum + (row.isSubtotal ? 0 : row.newStore), 0);
  const sumCampus = rows.reduce((sum, row) => sum + (row.isSubtotal ? 0 : row.campus), 0);
  const sumTotal = rows.reduce((sum, row) => sum + (row.isSubtotal ? 0 : row.total), 0);

  const handleCopy = async () => {
    if (!cardCaptureRef.current) return;
    setCopying(true);
    setCopyMessage("");
    try {
      await copyElementAsImageToClipboard(cardCaptureRef.current);
      setCopyMessage("복사 완료");
    } catch (e: any) {
      setCopyMessage(e?.message ?? "복사 실패");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div ref={cardCaptureRef}>
      <Card
        title="작업파트별 출고배수"
        subtitle={`납품예정일: ${formatDeliveryDateLabel(deliveryDate)}`}
        minHeight={WEATHER_MIN_H}
        right={
          <div data-copy-hide="true" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={handleCopy}
                disabled={copying || loading || !!err || rows.length === 0}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 4,
                  border: "1px solid #b9cddd",
                  background: copying || loading || !!err || rows.length === 0 ? "#e5edf3" : "#ffffff",
                  color: copying || loading || !!err || rows.length === 0 ? "#90a4b4" : "#103b53",
                  cursor: copying || loading || !!err || rows.length === 0 ? "default" : "pointer",
                  fontWeight: 950,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {copying ? "복사중" : "복사"}
              </button>
              <button
                onClick={() => void load()}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 4,
                  border: "1px solid #0e7490",
                  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 950,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 18px rgba(16,59,83,0.20)",
                }}
              >
                새로고침
              </button>
            </div>
            {copyMessage ? <div style={{ maxWidth: 220, fontSize: 11.5, color: copyMessage === "복사 완료" ? "#0f766e" : "#b91c1c", fontWeight: 800, textAlign: "right", lineHeight: 1.2, wordBreak: "keep-all" }}>{copyMessage}</div> : null}
          </div>
        }
      >
        {loading ? (
          <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중...</div>
        ) : err ? (
          <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>
        ) : rows.length === 0 ? (
          <div style={{ color: "#6B7280", fontSize: 13 }}>단품별 최신 데이터가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
            <div style={{ border: "1px solid #d9e6ef", borderRadius: 0, overflow: "hidden", flex: 1, minHeight: 0, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "31%" }} />
                  <col style={{ width: "17.25%" }} />
                  <col style={{ width: "17.25%" }} />
                  <col style={{ width: "17.25%" }} />
                  <col style={{ width: "17.25%" }} />
                </colgroup>
                <thead>
                  <tr style={{ background: "#eef5fb" }}>
                    <th style={{ textAlign: "left", padding: "10px 10px", fontSize: 12, fontWeight: 950, color: "#103b53", whiteSpace: "nowrap" }}>작업구분</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", fontSize: 11.5, fontWeight: 950, color: "#103b53", whiteSpace: "nowrap" }}>일반</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", fontSize: 11.5, fontWeight: 950, color: "#103b53", whiteSpace: "nowrap" }}>신규점</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", fontSize: 11.5, fontWeight: 950, color: "#103b53", whiteSpace: "nowrap" }}>캠퍼스</th>
                    <th style={{ textAlign: "right", padding: "10px 8px", fontSize: 11.5, fontWeight: 950, color: "#103b53", whiteSpace: "nowrap" }}>총합계</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isBoxBlockStart = row.label === "박스수기";
                    const isBoxBlockEnd = row.label === "박스합계";
                    const isTobaccoBlockStart = row.label === "담배존";
                    const isTobaccoBlockEnd = row.label === "담배합계";
                    const borderTop = isBoxBlockStart || isTobaccoBlockStart ? "2px solid #d6e6f2" : "1px solid #eef3f7";
                    const borderBottom = isBoxBlockEnd || isTobaccoBlockEnd ? "2px solid #d6e6f2" : undefined;
                    const background = row.isSubtotal ? "#f4f9fd" : "#fff";

                    return (
                      <tr key={row.label} style={{ borderTop, borderBottom, background }}>
                        <td style={{ padding: "9px 10px", fontSize: row.label === "올데이2L생수" || row.label === "노브랜드2L생수" ? 11.5 : 13, fontWeight: row.isSubtotal ? 950 : 800, color: "#0f2940", whiteSpace: "nowrap" }}>{row.label}</td>
                        <td style={{ padding: "9px 8px", fontSize: 12.5, textAlign: "right", color: "#113247", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: row.isSubtotal ? 900 : 500 }}>{formatOutboundCount(row.general)}</td>
                        <td style={{ padding: "9px 8px", fontSize: 12.5, textAlign: "right", color: "#113247", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: row.isSubtotal ? 900 : 500 }}>{formatOutboundCount(row.newStore)}</td>
                        <td style={{ padding: "9px 8px", fontSize: 12.5, textAlign: "right", color: "#113247", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: row.isSubtotal ? 900 : 500 }}>{formatOutboundCount(row.campus)}</td>
                        <td style={{ padding: "9px 8px", fontSize: 12.5, textAlign: "right", color: "#111827", fontWeight: 900, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatOutboundCount(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "1px solid #d9e6ef", paddingTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "31%" }} />
                  <col style={{ width: "17.25%" }} />
                  <col style={{ width: "17.25%" }} />
                  <col style={{ width: "17.25%" }} />
                  <col style={{ width: "17.25%" }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td style={{ padding: "6px 10px", fontSize: 13, fontWeight: 950, color: "#103b53", whiteSpace: "nowrap" }}>총합계</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 13, fontWeight: 900, color: "#113247", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatOutboundCount(sumGeneral)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 13, fontWeight: 900, color: "#113247", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatOutboundCount(sumNewStore)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 13, fontWeight: 900, color: "#113247", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatOutboundCount(sumCampus)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 14, fontWeight: 950, color: "#0f2940", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatOutboundCount(sumTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 입고예정 파트별 발주 현황 카드 ────────────────────────────────────────────
function InboundSummaryCard() {
  type InboundItem = { label: string; count: number; ord_price: number };

  const [summaryRows, setSummaryRows] = useState<InboundItem[]>([]);
  const [summaryTotal, setSummaryTotal] = useState({ count: 0, ord_price: 0 });
  const [summaryNoTobacco, setSummaryNoTobacco] = useState({ count: 0, ord_price: 0 });
  const [targetDateLabel, setTargetDateLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  function fmt(n: number) { return n.toLocaleString("ko-KR"); }
  function normalizeDate(s: string) { return s.replace(/\D/g, "").slice(0, 8); }
  function fmtDate(s: string) {
    const d = normalizeDate(s);
    if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
    return s || "-";
  }
  function nextWorkdayDate() {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1));
    const dow = d.getUTCDay();
    if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
    return d.getUTCFullYear().toString() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  }
  function dateLabel(yyyymmdd: string) {
    const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
    const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00+09:00`);
    return `${fmtDate(yyyymmdd)}(${DOW_KO[d.getDay()]})`;
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/admin/inbound-status", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json() as { ok: boolean; rows?: Array<Record<string, unknown>>; worktypeMap?: Record<string, string> };
        const rows = (json.rows ?? []) as Array<{ inb_ect_date: string; inb_status: string; shortage_status: string; item_cd: string; ord_price: number }>;
        const worktypeMap = json.worktypeMap ?? {};
        const target = nextWorkdayDate();
        setTargetDateLabel(dateLabel(target));

        const EXCLUDE_SHORTAGE = new Set(["완납", "완전결품"]);
        const filtered = rows.filter((r) =>
          normalizeDate(r.inb_ect_date) === target &&
          r.inb_status === "입고예정" &&
          !EXCLUDE_SHORTAGE.has(r.shortage_status)
        );

        const groups = new Map<string, { count: number; ord_price: number }>();
        for (const r of filtered) {
          const key = worktypeMap[r.item_cd] || "미분류";
          const g = groups.get(key) ?? { count: 0, ord_price: 0 };
          g.count += 1;
          g.ord_price += r.ord_price;
          groups.set(key, g);
        }

        const ORDER = ["박스수기", "박스존1", "이너존A", "슬라존A", "경량존A", "이형존A", "담배존", "담배수기", "미분류", "유가증권"];
        const sorted = [...groups.entries()]
          .filter(([label]) => label !== "공병존")
          .map(([label, v]) => ({ label, ...v }))
          .sort((a, b) => {
            const ai = ORDER.indexOf(a.label), bi = ORDER.indexOf(b.label);
            if (ai === -1 && bi === -1) return a.label.localeCompare(b.label, "ko");
            if (ai === -1) return 1; if (bi === -1) return -1;
            return ai - bi;
          });

        setSummaryRows(sorted);
        setSummaryTotal(sorted.reduce((acc, r) => ({ count: acc.count + r.count, ord_price: acc.ord_price + r.ord_price }), { count: 0, ord_price: 0 }));
        setSummaryNoTobacco(sorted.filter(r => r.label !== "담배존" && r.label !== "담배수기").reduce((acc, r) => ({ count: acc.count + r.count, ord_price: acc.ord_price + r.ord_price }), { count: 0, ord_price: 0 }));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!copyMsg) return;
    const t = window.setTimeout(() => setCopyMsg(""), 2000);
    return () => window.clearTimeout(t);
  }, [copyMsg]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const hasWrite = !!(navigator.clipboard as { write?: unknown })?.write;
      const hasItem = typeof (window as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";
      if (!hasWrite || !hasItem) throw new Error("이 브라우저는 이미지 복사를 지원하지 않습니다.");

      const DPR = 2, PAD = 14, ROW_H = 26, HEAD_H = 36, TITLE_H = 38, FOOT_H = 28;
      const COL_LABEL = 110, COL_COUNT = 52, COL_PRICE = 110;
      const W = PAD + COL_LABEL + COL_COUNT + COL_PRICE + PAD;
      const H = TITLE_H + HEAD_H + ROW_H * summaryRows.length + FOOT_H * 2;

      const canvas = document.createElement("canvas");
      canvas.width = W * DPR; canvas.height = H * DPR;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(DPR, DPR);

      const drawRight = (text: string, rx: number, my: number, size: number, color: string, bold = false) => {
        ctx.fillStyle = color;
        ctx.font = `${bold ? "bold " : ""}${size}px -apple-system, "Malgun Gothic", sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(text, rx - ctx.measureText(text).width, my);
      };

      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#f4f8fc"; ctx.fillRect(0, 0, W, TITLE_H);
      ctx.strokeStyle = "#d9e6ef"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, TITLE_H); ctx.lineTo(W, TITLE_H); ctx.stroke();
      ctx.fillStyle = "#103b53"; ctx.font = `bold 13px -apple-system, "Malgun Gothic", sans-serif`; ctx.textBaseline = "middle";
      ctx.fillText("작업파트별 입고 예정", PAD, TITLE_H / 2);
      ctx.fillStyle = "#557186"; ctx.font = `11px -apple-system, "Malgun Gothic", sans-serif`;
      const dlbl = `입고예정일: ${targetDateLabel}`;
      ctx.fillText(dlbl, W - PAD - ctx.measureText(dlbl).width, TITLE_H / 2);

      ctx.fillStyle = "#eef5fb"; ctx.fillRect(0, TITLE_H, W, HEAD_H);
      ctx.strokeStyle = "#d9e6ef";
      ctx.beginPath(); ctx.moveTo(0, TITLE_H + HEAD_H); ctx.lineTo(W, TITLE_H + HEAD_H); ctx.stroke();
      ctx.fillStyle = "#103b53"; ctx.font = `bold 12px -apple-system, "Malgun Gothic", sans-serif`; ctx.textBaseline = "middle";
      ctx.fillText("작업구분", PAD, TITLE_H + HEAD_H / 2);
      drawRight("건수", PAD + COL_LABEL + COL_COUNT, TITLE_H + HEAD_H / 2, 12, "#103b53", true);
      drawRight("발주금액", PAD + COL_LABEL + COL_COUNT + COL_PRICE, TITLE_H + HEAD_H / 2, 12, "#103b53", true);

      summaryRows.forEach((r, i) => {
        const y = TITLE_H + HEAD_H + i * ROW_H;
        ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#f8fbfd"; ctx.fillRect(0, y, W, ROW_H);
        ctx.strokeStyle = "#eef3f7"; ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(W, y + ROW_H); ctx.stroke();
        const mid = y + ROW_H / 2;
        ctx.fillStyle = "#0f2940"; ctx.font = `bold 12px -apple-system, "Malgun Gothic", sans-serif`; ctx.textBaseline = "middle";
        ctx.fillText(r.label, PAD, mid);
        drawRight(fmt(r.count), PAD + COL_LABEL + COL_COUNT, mid, 12, "#374151");
        drawRight(fmt(Math.round(r.ord_price)), PAD + COL_LABEL + COL_COUNT + COL_PRICE, mid, 12, "#1D4ED8", true);
      });

      const footY = TITLE_H + HEAD_H + ROW_H * summaryRows.length;
      ctx.fillStyle = "#f4f8fc"; ctx.fillRect(0, footY, W, FOOT_H);
      ctx.strokeStyle = "#d9e6ef"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, footY); ctx.lineTo(W, footY); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = "#103b53"; ctx.font = `bold 13px -apple-system, "Malgun Gothic", sans-serif`; ctx.textBaseline = "middle";
      ctx.fillText("합계", PAD, footY + FOOT_H / 2);
      drawRight(fmt(summaryTotal.count), PAD + COL_LABEL + COL_COUNT, footY + FOOT_H / 2, 13, "#113247", true);
      drawRight(fmt(Math.round(summaryTotal.ord_price)), PAD + COL_LABEL + COL_COUNT + COL_PRICE, footY + FOOT_H / 2, 13, "#0f2940", true);

      const foot2Y = footY + FOOT_H;
      ctx.fillStyle = "#eef4f9"; ctx.fillRect(0, foot2Y, W, FOOT_H);
      ctx.strokeStyle = "#d9e6ef"; ctx.beginPath(); ctx.moveTo(0, foot2Y); ctx.lineTo(W, foot2Y); ctx.stroke();
      ctx.fillStyle = "#103b53"; ctx.font = `bold 13px -apple-system, "Malgun Gothic", sans-serif`; ctx.textBaseline = "middle";
      ctx.fillText("담배제외", PAD, foot2Y + FOOT_H / 2);
      drawRight(fmt(summaryNoTobacco.count), PAD + COL_LABEL + COL_COUNT, foot2Y + FOOT_H / 2, 13, "#113247", true);
      drawRight(fmt(Math.round(summaryNoTobacco.ord_price)), PAD + COL_LABEL + COL_COUNT + COL_PRICE, foot2Y + FOOT_H / 2, 13, "#0f2940", true);

      ctx.strokeStyle = "#d9e6ef"; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("이미지를 만들지 못했습니다.");
      if (!document.hasFocus()) { window.focus(); await new Promise((r) => setTimeout(r, 50)); }
      const item = new (window as { ClipboardItem: new (a: Record<string, Blob>) => unknown }).ClipboardItem({ "image/png": blob });
      await (navigator.clipboard as unknown as { write: (a: unknown[]) => Promise<void> }).write([item]);
      setCopyMsg("복사 완료");
    } catch (e: unknown) {
      setCopyMsg((e as Error)?.message ?? "복사 실패");
    } finally {
      setCopying(false);
    }
  };

  return (
    <Card
      title="작업파트별 입고 예정"
      subtitle={targetDateLabel ? `입고예정일: ${targetDateLabel}` : ""}
      right={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button
            onClick={handleCopy}
            disabled={copying || loading || summaryRows.length === 0}
            style={{
              height: 30, padding: "0 12px", borderRadius: 4,
              border: "1px solid #b9cddd",
              background: copying || loading || summaryRows.length === 0 ? "#e5edf3" : "#ffffff",
              color: copying || loading || summaryRows.length === 0 ? "#90a4b4" : "#103b53",
              cursor: copying || loading || summaryRows.length === 0 ? "default" : "pointer",
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
      }
    >
      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>불러오는 중...</div>
      ) : summaryRows.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>데이터가 없습니다.</div>
      ) : (
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr style={{ background: "#eef5fb" }}>
              <th style={{ textAlign: "left", padding: "5px 10px", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap", borderBottom: "1px solid #d9e6ef" }}>작업구분</th>
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
    </Card>
  );
}

/** -------- 달력 및 3일 미리보기 (제목만) -------- */
function ThreeDayPreview({
  baseYMD,
  events,
  holidaysByDate,
}: {
  baseYMD: string;
  events: EventRow[];
  holidaysByDate: Record<string, HolidayRow>;
}) {
  const days = [0, 1, 2].map((d) => addDaysYMD(baseYMD, d));

  const grouped = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    for (const ymd of days) map[ymd] = [];
    for (const e of events) if (map[e.date]) map[e.date].push(e);
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const typeDiff = compareCalendarEventType(a.event_type, b.event_type);
        if (typeDiff !== 0) return typeDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }
    return map;
  }, [events, days]);

  return (
    <div style={{ marginTop: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontWeight: 950, fontSize: 13, color: "#103b53", marginBottom: 7 }}>3일 미리보기</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
        {days.map((ymd) => {
          const list = grouped[ymd] ?? [];
          const holidayName = holidayDisplayName(ymd, holidaysByDate);
          return (
            <div
              key={ymd}
              style={{
                border: "1px solid #d9e6ef",
                borderRadius: 0,
                padding: 10,
                background: "#fff",
                overflow: "hidden",
                boxShadow: "0 6px 14px rgba(2,32,46,0.06)",
                flex: "1 1 auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 13, color: "#113247", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span>
                  {ymd} ({dowKo(ymd)}) · <span style={{ color: "#5a7588" }}>{list.length}건</span>
                </span>
                {holidayName ? (
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#EF4444", flexShrink: 0, whiteSpace: "nowrap" }} title={holidayName}>{holidayName.replace(/\(.*\)/, "").trim()}</span>
                ) : null}
              </div>

              {list.length === 0 ? (
                <div style={{ marginTop: 6, color: "#5a7588", fontSize: 12 }}>등록된 일정 없음</div>
              ) : (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
                  {list.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      style={{ fontSize: 13, color: "#35556b", display: "flex", gap: 6, minWidth: 0 }}
                      title={e.title}
                    >
                      <span
                        style={{
                          minWidth: 28,
                          height: 16,
                          padding: "0 4px",
                          borderRadius: 3,
                          background: CALENDAR_EVENT_TYPE_BADGE[e.event_type].bg,
                          border: `1px solid ${CALENDAR_EVENT_TYPE_BADGE[e.event_type].border}`,
                          color: CALENDAR_EVENT_TYPE_BADGE[e.event_type].text,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 900,
                          lineHeight: 1,
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      >
                        {e.event_type === "general"
                          ? "일반"
                          : e.event_type === "new_store"
                            ? "신규"
                            : "NB"}
                      </span>
                      <span
                        style={{
                          fontWeight: 950,
                          color: "#113247",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {e.title}
                      </span>
                    </div>
                  ))}
                  {list.length > 3 ? <div style={{ fontSize: 12, color: "#5a7588" }}>+{list.length - 3}건 더</div> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 점포 검색 위젯 (우측 하단 fixed)
// ─────────────────────────────────────────────────────────────────────
type StoreResult = {
  store_code: string;
  store_name: string;
  car_no: string;
  seq_no: number;
  delivery_due_time: string | null;
  address: string | null;
  phone: string | null;
  phone_memo: string | null;
};

type ProductOrderItem = {
  cell_name: string;
  product_code: string;
  product_name: string;
  work_type: string;
  qty: number;
  delivery_date: string;
};

type ProductHistoryItem = {
  date: string;
  product_code: string;
  product_name: string;
  work_type: string;
  qty: number;
};

function formatPhoneDisplay(raw: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return raw;
}

type StoreDetailTab = "order" | "product";

function StoreSearchWidget() {
  // ── 점포 검색 패널 ──
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StoreResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const storeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 점포 상세 모달 ──
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);
  const [activeTab, setActiveTab] = useState<StoreDetailTab>("order");

  // ── 발주 단품 탭 ──
  const [orderDate, setOrderDate] = useState("");
  const [products, setProducts] = useState<ProductOrderItem[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productsFileName, setProductsFileName] = useState("");
  const [productsNoData, setProductsNoData] = useState(false);

  // ── 상품 이력 탭 ──
  const [productQuery, setProductQuery] = useState("");
  const [history, setHistory] = useState<ProductHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyScanned, setHistoryScanned] = useState(0);
  const [historyDays, setHistoryDays] = useState(60);
  const productDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const getToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  };

  // ── 점포 검색 ──
  const doStoreSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/admin/store-search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) setResults(data.stores ?? []);
    } catch {}
    finally { setSearching(false); }
  };

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (storeDebounceRef.current) clearTimeout(storeDebounceRef.current);
    storeDebounceRef.current = setTimeout(() => void doStoreSearch(v), 300);
  };

  // ── 점포 선택 ──
  const openStore = (store: StoreResult) => {
    setSelectedStore(store);
    setActiveTab("order");
    setOrderDate("");
    setProducts(null);
    setProductsError("");
    setProductsNoData(false);
    setProductsFileName("");
    setProductQuery("");
    setHistory(null);
    setHistoryError("");
  };

  const closeStore = () => {
    setSelectedStore(null);
  };

  const backToList = () => {
    setSelectedStore(null);
  };

  // ── 발주 단품 로드 ──
  const loadProducts = async (date: string, store: StoreResult) => {
    setProductsLoading(true);
    setProductsError("");
    setProducts(null);
    setProductsNoData(false);
    try {
      const token = await getToken();
      if (!token) return;
      const params = new URLSearchParams({
        date,
        store_code: store.store_code,
        store_name: store.store_name,
      });
      const res = await fetch(`/api/admin/store-daily-orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) { setProductsError(data.message ?? "불러오기 실패"); return; }
      if (data.noData) { setProductsNoData(true); return; }
      setProducts(data.products ?? []);
      setProductsFileName(data.fileName ?? "");
    } catch (e: any) {
      setProductsError(e?.message ?? "오류 발생");
    } finally {
      setProductsLoading(false);
    }
  };

  const onDateChange = (v: string) => {
    setOrderDate(v);
    if (v && selectedStore) void loadProducts(v, selectedStore);
  };

  // ── 상품 이력 검색 ──
  const doProductSearch = async (q: string, store: StoreResult, days: number) => {
    if (!q.trim() || q.trim().length < 2) { setHistory(null); setHistoryError(""); return; }
    setHistoryLoading(true);
    setHistoryError("");
    setHistory(null);
    try {
      const token = await getToken();
      if (!token) return;
      const params = new URLSearchParams({
        store_code: store.store_code,
        store_name: store.store_name,
        q: q.trim(),
        days: String(days),
      });
      const res = await fetch(`/api/admin/store-product-history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) { setHistoryError(data.message ?? "불러오기 실패"); return; }
      setHistory(data.history ?? []);
      setHistoryScanned(data.scanned ?? 0);
    } catch (e: any) {
      setHistoryError(e?.message ?? "오류 발생");
    } finally {
      setHistoryLoading(false);
    }
  };

  const onProductQueryChange = (v: string) => {
    setProductQuery(v);
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    if (!selectedStore) return;
    const store = selectedStore;
    const days = historyDays;
    productDebounceRef.current = setTimeout(() => void doProductSearch(v, store, days), 500);
  };

  const onHistoryDaysChange = (v: number) => {
    setHistoryDays(v);
    if (productQuery.trim().length >= 2 && selectedStore) {
      void doProductSearch(productQuery, selectedStore, v);
    }
  };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
    else { setQuery(""); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (activeTab === "product") setTimeout(() => productInputRef.current?.focus(), 60);
  }, [activeTab]);

  // ── 탭 전환 시 상품 검색 초기화 ──
  const switchTab = (tab: StoreDetailTab) => {
    setActiveTab(tab);
    if (tab === "order") {
      // 날짜 유지
    } else {
      setProductQuery("");
      setHistory(null);
      setHistoryError("");
    }
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 38,
    border: "none",
    borderBottom: active ? "2px solid #103b53" : "2px solid transparent",
    background: "transparent",
    color: active ? "#103b53" : "#64748b",
    fontWeight: active ? 950 : 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "color 0.15s",
  });

  const btnBase: React.CSSProperties = {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 9000,
    width: 52,
    height: 52,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
    boxShadow: "0 8px 24px rgba(16,59,83,0.38)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  };

  return (
    <>
      {/* 고정 버튼 */}
      <button style={btnBase} title="점포 검색" onClick={() => setOpen(true)}>
        🔍
      </button>

      {/* ── 점포 검색 패널 (우하단 슬라이드업) ── */}
      {open && !selectedStore && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.45)", zIndex: 9100, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ width: 360, background: "white", borderRadius: 0, boxShadow: "0 30px 60px rgba(2,6,23,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 950, fontSize: 15, color: "#0f2940" }}>점포 검색</div>
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#94a3b8", lineHeight: 1, padding: 2 }}>✕</button>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="점포코드 또는 점포명 입력"
                style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid #D1D5DB", borderRadius: 0, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", borderTop: "1px solid #f1f5f9" }}>
              {searching ? (
                <div style={{ padding: "16px 16px", color: "#64748b", fontSize: 13 }}>검색 중...</div>
              ) : results.length === 0 && query.trim() ? (
                <div style={{ padding: "16px 16px", color: "#64748b", fontSize: 13 }}>검색 결과 없음</div>
              ) : results.length === 0 ? (
                <div style={{ padding: "16px 16px", color: "#94a3b8", fontSize: 13 }}>점포코드 또는 점포명으로 검색하세요.</div>
              ) : (
                results.map((s) => (
                  <button
                    key={s.store_code}
                    onClick={() => openStore(s)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", border: "none", borderBottom: "1px solid #f1f5f9", background: "white", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#0f2940" }}>{s.store_name}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: "#64748b", display: "flex", gap: 8 }}>
                        <span>{s.store_code}</span>
                        {s.car_no && <span>호차: {s.car_no}</span>}
                        {s.phone && <span style={{ color: "#0284c7" }}>{formatPhoneDisplay(s.phone)}</span>}
                      </div>
                    </div>
                    <span style={{ color: "#cbd5e1", fontSize: 13 }}>{">"}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 점포 상세 모달 ── */}
      {selectedStore && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.5)", zIndex: 9200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeStore(); }}
        >
          <div style={{ width: "100%", maxWidth: 600, maxHeight: "92vh", background: "white", borderRadius: 0, boxShadow: "0 30px 60px rgba(2,6,23,0.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* 헤더 */}
            <div style={{ padding: "12px 16px 0", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 16, color: "#0f2940" }}>{selectedStore.store_name}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                    {selectedStore.store_code}
                    {selectedStore.car_no && ` · ${selectedStore.car_no}호차`}
                    {selectedStore.seq_no ? ` · 순번 ${selectedStore.seq_no}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={backToList}
                    style={{ height: 28, padding: "0 10px", border: "1px solid #CBD5E1", borderRadius: 0, background: "white", cursor: "pointer", fontSize: 12, fontWeight: 800, color: "#64748b" }}
                  >
                    목록
                  </button>
                  <button onClick={closeStore} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#94a3b8", lineHeight: 1, padding: 2 }}>✕</button>
                </div>
              </div>

              {/* 탭 */}
              <div style={{ display: "flex", marginBottom: -1 }}>
                <button style={tabBtnStyle(activeTab === "order")} onClick={() => switchTab("order")}>발주 단품</button>
                <button style={tabBtnStyle(activeTab === "product")} onClick={() => switchTab("product")}>상품 이력</button>
              </div>
            </div>

            {/* 본문 */}
            <div style={{ overflowY: "auto", flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

              {/* 기본 정보 (공통) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ border: "1px solid #e2e8f0", padding: "9px 12px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 3 }}>연락처</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0f2940", fontFamily: "monospace", letterSpacing: 0.3 }}>
                    {formatPhoneDisplay(selectedStore.phone) ?? "-"}
                  </div>
                  {selectedStore.phone_memo && <div style={{ marginTop: 3, fontSize: 11, color: "#64748b" }}>{selectedStore.phone_memo}</div>}
                </div>
                <div style={{ border: "1px solid #e2e8f0", padding: "9px 12px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 3 }}>점착기준시간</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0f2940" }}>{selectedStore.delivery_due_time || "-"}</div>
                </div>
              </div>
              {selectedStore.address && (
                <div style={{ border: "1px solid #e2e8f0", padding: "8px 12px", background: "#f8fafc", fontSize: 13, color: "#374151" }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginRight: 8 }}>주소</span>
                  {selectedStore.address}
                </div>
              )}

              {/* ── 발주 단품 탭 ── */}
              {activeTab === "order" && (
                <>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>납품예정일 선택</div>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => onDateChange(e.target.value)}
                      style={{ height: 38, padding: "0 10px", border: "1px solid #D1D5DB", borderRadius: 0, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }}
                    />
                  </div>

                  {orderDate && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>발주 단품 리스트</span>
                        {productsFileName && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{productsFileName}</span>}
                      </div>

                      {productsLoading ? (
                        <div style={{ padding: "14px 0", color: "#64748b", fontSize: 13 }}>불러오는 중...</div>
                      ) : productsError ? (
                        <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{productsError}</div>
                      ) : productsNoData ? (
                        <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>해당 날짜의 단품 데이터가 없습니다.</div>
                      ) : products && products.length === 0 ? (
                        <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>해당 날짜에 이 점포의 발주가 없습니다.</div>
                      ) : products && products.length > 0 ? (
                        <div style={{ border: "1px solid #e2e8f0", overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: "#eef5fb" }}>
                                <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>피킹셀</th>
                                <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>상품코드</th>
                                <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef" }}>상품명</th>
                                <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>출고수량</th>
                              </tr>
                            </thead>
                            <tbody>
                              {products.map((p, i) => (
                                <tr key={i} style={{ borderTop: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafcfe" }}>
                                  <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.cell_name || "-"}</td>
                                  <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.product_code || "-"}</td>
                                  <td style={{ padding: "8px 10px", fontSize: 12.5, color: "#0f2940", fontWeight: 700, wordBreak: "keep-all" }}>{p.product_name}</td>
                                  <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 900, color: "#0284c7", textAlign: "right", whiteSpace: "nowrap" }}>{p.qty.toLocaleString("ko-KR")}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: "2px solid #d9e6ef", background: "#eef5fb" }}>
                                <td colSpan={3} style={{ padding: "8px 10px", fontSize: 12.5, fontWeight: 950, color: "#103b53" }}>합계</td>
                                <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 950, color: "#0f2940", textAlign: "right" }}>
                                  {products.reduce((s, p) => s + p.qty, 0).toLocaleString("ko-KR")}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}

              {/* ── 상품 이력 탭 ── */}
              {activeTab === "product" && (
                <>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#374151" }}>바코드 또는 상품명 검색</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>조회 기간</span>
                        <select
                          value={historyDays}
                          onChange={(e) => onHistoryDaysChange(Number(e.target.value))}
                          style={{ height: 28, padding: "0 6px", border: "1px solid #D1D5DB", borderRadius: 0, fontSize: 12, outline: "none", cursor: "pointer", background: "white", color: "#0f2940", fontWeight: 800 }}
                        >
                          <option value={30}>30일</option>
                          <option value={60}>60일</option>
                          <option value={90}>90일</option>
                          <option value={180}>180일</option>
                          <option value={365}>365일</option>
                        </select>
                      </div>
                    </div>
                    <input
                      ref={productInputRef}
                      value={productQuery}
                      onChange={(e) => onProductQueryChange(e.target.value)}
                      placeholder="바코드 또는 상품명 2자 이상 입력"
                      style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid #D1D5DB", borderRadius: 0, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    />
                    <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>최근 {historyDays}일 이내 납품예정일 이력을 조회합니다.</div>
                  </div>

                  {historyLoading ? (
                    <div style={{ padding: "14px 0", color: "#64748b", fontSize: 13 }}>이력 조회 중... (최대 60일 스캔)</div>
                  ) : historyError ? (
                    <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{historyError}</div>
                  ) : history !== null && history.length === 0 ? (
                    <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
                      검색 결과 없음{historyScanned > 0 && ` (${historyScanned}일치 스캔)`}
                    </div>
                  ) : history && history.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                        {history.length}건{historyScanned > 0 && ` · ${historyScanned}일치 스캔`}
                      </div>
                      <div style={{ border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: "#eef5fb" }}>
                              <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>납품예정일</th>
                              <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef" }}>상품명</th>
                              <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>바코드</th>
                              <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>작업구분</th>
                              <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 950, color: "#103b53", fontSize: 12, borderBottom: "1px solid #d9e6ef", whiteSpace: "nowrap" }}>수량</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((h, i) => (
                              <tr key={i} style={{ borderTop: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafcfe" }}>
                                <td style={{ padding: "8px 10px", fontSize: 12.5, fontWeight: 800, color: "#0f2940", whiteSpace: "nowrap" }}>{h.date}</td>
                                <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", wordBreak: "keep-all" }}>{h.product_name}</td>
                                <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" }}>{h.product_code || "-"}</td>
                                <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{h.work_type || "-"}</td>
                                <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 900, color: "#0284c7", textAlign: "right", whiteSpace: "nowrap" }}>{h.qty.toLocaleString("ko-KR")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : productQuery.trim().length >= 2 ? null : (
                    <div style={{ padding: "12px 0", color: "#94a3b8", fontSize: 13 }}>바코드 또는 상품명을 2자 이상 입력하면 이력을 조회합니다.</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminHomePage() {
  const [ready, setReady] = useState(false);

  const [checking, setChecking] = useState(true);
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionUid, setSessionUid] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [ym, setYm] = useState<{ y: number; m: number }>({ y: 1970, m: 1 });
  const [selectedYMD, setSelectedYMD] = useState("1970-01-01");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [pendingRedeliveryCount, setPendingRedeliveryCount] = useState(0);
  const [pendingHazardCount, setPendingHazardCount] = useState(0);
  const [hazardWaitingCount, setHazardWaitingCount] = useState(0);

  const mounted = useRef(false);

  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const sess = data.session;
    if (!sess) {
      hardToLogin();
      return { ok: false as const };
    }

    const uid = sess.user.id;
    const email = sess.user.email ?? "";
    setSessionUid(uid);
    setSessionEmail(email);

    const { data: prof } = await supabase.from("profiles").select("id, is_admin, work_part").eq("id", uid).maybeSingle();

    const hardAdmin = isMainAdminIdentity(uid, email);
    const main = hardAdmin || (!!prof && !!(prof as any).is_admin);
    const general = isGeneralAdminWorkPart((prof as any)?.work_part);
    const admin = main || general;
    setIsAdmin(admin);

    return { ok: true as const, admin };
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) hardToLogin();
    });
    return () => {
      try {
        sub.subscription.unsubscribe();
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    (async () => {
      setChecking(true);
      try {
        const r = await loadAdmin();
        if (!r.ok) return;
        if (!r.admin) setIsAdmin(false);
      } catch {
        hardToLogin();
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    const t = kstTodayYYYYMMDD();
    setSelectedYMD(t);
    const [y, m] = t.split("-").map(Number);
    setYm({ y, m });
    setReady(true);
  }, []);

  const monthLabel = useMemo(() => `${ym.y}. ${pad2(ym.m)}`, [ym.y, ym.m]);

  const goPrev = () => {
    setYm((prev) => {
      const nm = prev.m - 1;
      if (nm < 1) return { y: prev.y - 1, m: 12 };
      return { y: prev.y, m: nm };
    });
  };
  const goNext = () => {
    setYm((prev) => {
      const nm = prev.m + 1;
      if (nm > 12) return { y: prev.y + 1, m: 1 };
      return { y: prev.y, m: nm };
    });
  };
  const goToday = () => {
    const t = kstTodayYYYYMMDD();
    setSelectedYMD(t);
    const [y, m] = t.split("-").map(Number);
    setYm({ y, m });
  };

  const grid = useMemo<Cell[]>(() => {
    const start = startWeekdayOfMonth(ym.y, ym.m);
    const dim = daysInMonth(ym.y, ym.m);
    const usedWeeks = Math.ceil((start + dim) / 7);
    const spareWeeks = Math.max(0, 6 - usedWeeks);
    // 6주 달력 기준으로 남는 주가 있으면 앞쪽에도 배치해서 표시 균형을 맞춘다.
    const frontExtraWeeks = Math.ceil(spareWeeks / 2);

    const firstOfMonth = `${ym.y}-${pad2(ym.m)}-01`;
    const firstVisible = addDaysYMD(firstOfMonth, -(start + frontExtraWeeks * 7));
    const monthPrefix = `${ym.y}-${pad2(ym.m)}-`;

    const cells: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const ymd = addDaysYMD(firstVisible, i);
      const day = Number(ymd.slice(8, 10));
      const weekday = new Date(`${ymd}T00:00:00+09:00`).getDay();
      cells.push({
        day,
        weekday,
        ymd,
        inCurrentMonth: ymd.startsWith(monthPrefix),
      });
    }
    return cells;
  }, [ym.y, ym.m]);

  const fetchMonthEvents = async () => {
    setLoadingEvents(true);
    try {
      const start = `${ym.y}-${pad2(ym.m)}-01`;
      const end = `${ym.y}-${pad2(ym.m)}-${pad2(daysInMonth(ym.y, ym.m))}`;
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = session?.access_token;
      if (!token) throw new Error("세션이 없습니다. 다시 로그인해 주세요.");

      const res = await fetch(`/api/admin/calendar-month?from=${start}&to=${end}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        events?: EventRow[];
        holidays?: HolidayRow[];
      };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "달력 데이터를 불러오지 못했습니다.");
      }

      const nextEvents = (payload.events ?? []).map((event) => ({
        ...event,
        event_type: parseCalendarEventType(event.memo),
      }));
      const nextHolidays = (payload.holidays ?? []) as HolidayRow[];
      setEvents(nextEvents);
      setHolidays(nextHolidays);
      writeHomeCache(monthCacheKey(ym.y, ym.m), { events: nextEvents, holidays: nextHolidays });
    } catch {
      setEvents([]);
      setHolidays([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchPendingSummary = async () => {
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    if (sessionErr) return;
    const token = session?.access_token;
    if (!token) return;

    const res = await fetch("/api/admin/pending-summary", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      pendingHazardCount?: number;
      hazardWaitingCount?: number;
      pendingRedeliveryCount?: number;
    };
    if (!res.ok || !payload.ok) return;

    setPendingHazardCount(payload.pendingHazardCount ?? 0);
    setHazardWaitingCount(payload.hazardWaitingCount ?? 0);
    setPendingRedeliveryCount(payload.pendingRedeliveryCount ?? 0);
    writeHomeCache(HOME_PENDING_SUMMARY_CACHE_KEY, {
      pendingHazardCount: payload.pendingHazardCount ?? 0,
      hazardWaitingCount: payload.hazardWaitingCount ?? 0,
      pendingRedeliveryCount: payload.pendingRedeliveryCount ?? 0,
    });
  };

  useEffect(() => {
    if (!ready) return;
    if (checking) return;
    if (!isAdmin) return;
    const cached = readHomeCache<{ events?: EventRow[]; holidays?: HolidayRow[] }>(monthCacheKey(ym.y, ym.m));
    if (cached?.events && cached?.holidays) {
      setEvents(cached.events);
      setHolidays(cached.holidays);
      void fetchMonthEvents();
      return;
    }
    void fetchMonthEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, checking, isAdmin, ym.y, ym.m]);

  useEffect(() => {
    if (!ready || checking || !isAdmin) return;
    let cancelled = false;

    const preloadMonth = async (year: number, month: number) => {
      if (readHomeCache(monthCacheKey(year, month))) return;
      try {
        const start = `${year}-${pad2(month)}-01`;
        const end = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
        const {
          data: { session },
          error: sessionErr,
        } = await supabase.auth.getSession();
        if (sessionErr) return;
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch(`/api/admin/calendar-month?from=${start}&to=${end}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          events?: EventRow[];
          holidays?: HolidayRow[];
        };
        if (!res.ok || !payload.ok || cancelled) return;
        writeHomeCache(monthCacheKey(year, month), {
          events: (payload.events ?? []).map((event) => ({
            ...event,
            event_type: parseCalendarEventType(event.memo),
          })),
          holidays: (payload.holidays ?? []) as HolidayRow[],
        });
      } catch {}
    };

    const prev = shiftYearMonth(ym.y, ym.m, -1);
    const next = shiftYearMonth(ym.y, ym.m, 1);
    void Promise.all([preloadMonth(prev.y, prev.m), preloadMonth(next.y, next.m)]);

    return () => {
      cancelled = true;
    };
  }, [ready, checking, isAdmin, ym.y, ym.m]);

  useEffect(() => {
    if (!ready) return;
    if (checking) return;
    if (!isAdmin) return;
    const cached = readHomeCache<{
      pendingHazardCount?: number;
      hazardWaitingCount?: number;
      pendingRedeliveryCount?: number;
    }>(HOME_PENDING_SUMMARY_CACHE_KEY);
    if (cached) {
      setPendingHazardCount(cached.pendingHazardCount ?? 0);
      setHazardWaitingCount(cached.hazardWaitingCount ?? 0);
      setPendingRedeliveryCount(cached.pendingRedeliveryCount ?? 0);
      void fetchPendingSummary();
      return;
    }
    void fetchPendingSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, checking, isAdmin]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [events]);

  const holidaysByDate = useMemo(() => {
    const map: Record<string, HolidayRow> = {};
    for (const h of holidays) map[h.date] = h;
    return map;
  }, [holidays]);

  const hazardSummaryBadge = useMemo(
    () => getHazardSummaryBadge(pendingHazardCount, hazardWaitingCount),
    [pendingHazardCount, hazardWaitingCount]
  );

  const countFor = (ymd: string) => (eventsByDate[ymd] ?? []).length;

  if (checking || !ready) return <div style={{ padding: 16, color: "#6B7280" }}>로딩...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>권한이 없습니다.</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자 계정으로 로그인해야 접근 가능합니다.</div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>
          현재 로그인: {sessionEmail || "-"} / UID: {sessionUid || "-"}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => hardToLogin()}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 4,
              border: "1px solid #111827",
              background: "white",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 8px", fontFamily: "system-ui" }}>
      <div
        style={
          {
            maxWidth: 1700,
            margin: "0 auto",
            ["--leftColW" as any]: `${LEFT_COL_W}px`,
            ["--colGap" as any]: COL_GAP,
            ["--rowGap" as any]: ROW_GAP,
          } as React.CSSProperties
        }
      >
        <div className="homeGrid">
          <div className="leftCol" style={{ flexDirection: "column", gap: 8 }}>
            <Card
              title={monthLabel}
              minHeight={CARD_MIN_H}
              bodyPadding={8}
              right={
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={goPrev}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 4,
                        border: "1px solid #c4d5e3",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      {"<"}
                    </button>
                    <button
                      onClick={goNext}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 4,
                        border: "1px solid #c4d5e3",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      {">"}
                    </button>
                    <button
                      onClick={goToday}
                      style={{
                        height: 26,
                        padding: "0 10px",
                        borderRadius: 4,
                        border: "1px solid #0e7490",
                        background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                        color: "white",
                        boxShadow: "0 8px 18px rgba(16,59,83,0.22)",
                      }}
                    >
                      오늘
                    </button>
                  </div>
                }
              >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "4px 0" }}>
                {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
                  <div
                    key={w}
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 950,
                      color: w === "일" ? "#EF4444" : "#374151",
                    }}
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div style={{ padding: "6px 0 8px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gridTemplateRows: "repeat(6, minmax(0, 1fr))",
                    rowGap: 8,
                    height: 276,
                  }}
                >
                  {grid.map((c, idx) => {
                    const isSelected = c.ymd === selectedYMD;
                    const isSun = c.weekday === 0;
                    const holiday = holidaysByDate[c.ymd];
                    const isHoliday = !!holiday;
                    const holidayName = holidayDisplayName(c.ymd, holidaysByDate);
                    const count = countFor(c.ymd);
                    const badgeText = count > 99 ? "99+" : String(count);
                    const badgeCounts = summarizeCalendarEventTypes((eventsByDate[c.ymd] ?? []).map((event) => event.event_type));
                    const dominantType = dominantCalendarEventType((eventsByDate[c.ymd] ?? []).map((event) => event.event_type));
                    const badgeBg = calendarEventBadgeBackground(badgeCounts);
                    const badgeBorder = calendarEventBadgeBorderColor(badgeCounts);
                    const mixedBadge = isMixedCalendarEventTypes(badgeCounts);

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedYMD(c.ymd)}
                        style={{
                          height: "100%",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 999,
                            background: isSelected ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)" : "transparent",
                            color: isSelected ? "white" : !c.inCurrentMonth ? "#C3CAD5" : isSun || isHoliday ? "#EF4444" : "#113247",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 950,
                            fontSize: 15,
                            position: "relative",
                          }}
                          title={holidayName ? `${c.ymd} / ${holidayName}` : c.ymd}
                        >
                          {c.day}

                          {count > 0 && !isHoliday && (
                            <span
                              style={{
                                position: "absolute",
                                top: -6,
                                right: -7,
                                minWidth: 18,
                                height: 18,
                                padding: "0 5px",
                                borderRadius: 999,
                                background: isSelected ? "white" : badgeBg,
                                color: mixedBadge ? "#6B7280" : CALENDAR_EVENT_TYPE_BADGE[dominantType].text,
                                border: `1px solid ${badgeBorder}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 950,
                                lineHeight: 1,
                              }}
                            >
                              {badgeText}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: 0, flex: 1, minHeight: 0, paddingBottom: 4 }}>
                <div style={{ height: "100%", overflow: "hidden", paddingBottom: 3 }}>
                  <ThreeDayPreview baseYMD={selectedYMD} events={events} holidaysByDate={holidaysByDate} />
                </div>
              </div>
            </Card>
            <div
              style={{
                border: "1px solid #bdd0de",
                borderRadius: 0,
                background: "#fff",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                boxShadow: "0 10px 24px rgba(2,32,46,0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #d9e6ef", borderRadius: 0, padding: "6px 8px", color: "#113247", fontSize: 12, fontWeight: 900, background: "#fff" }}>
                <span style={{ width: 9, height: 9, borderRadius: 4, background: pendingRedeliveryCount > 0 ? "#DC2626" : "#16A34A", boxShadow: pendingRedeliveryCount > 0 ? "0 0 0 3px rgba(220,38,38,0.15)" : "0 0 0 3px rgba(22,163,74,0.15)", flex: "0 0 auto" }} />
                <span style={{ flex: 1, color: "#113247" }}>재배송 미처리 {pendingRedeliveryCount}건</span>
                <Link href="/admin/photos/delivery" style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #c4d5e3", color: "#113247", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, lineHeight: 1, fontWeight: 900, background: "#fff" }} title="배송사진 페이지로 이동">&gt;</Link>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #d9e6ef", borderRadius: 0, padding: "6px 8px", color: "#113247", fontSize: 12, fontWeight: 900, background: "#fff" }}>
                <span style={{ width: 9, height: 9, borderRadius: 4, background: hazardSummaryBadge.dot, boxShadow: hazardSummaryBadge.glow, flex: "0 0 auto" }} />
                <span style={{ flex: 1, color: "#113247" }}>{hazardSummaryBadge.text}</span>
                <Link href="/admin/hazards" style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #c4d5e3", color: "#113247", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, lineHeight: 1, fontWeight: 900, background: "#fff" }} title="위험요인 페이지로 이동">&gt;</Link>
              </div>
            </div>
          </div>

          <div className="midCol">
            <NoticeMainCard />
          </div>

          <div className="summaryCol">
            <WorkTypeOutboundCard />
            <InboundSummaryCard />
          </div>

          <div className="rightCol">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <DpsProgressCard />
              <WeatherCard />
            </div>
          </div>
        </div>


        <StoreSearchWidget />

        <style jsx>{`
          .homeGrid {
            display: grid;
            grid-template-columns: var(--leftColW) minmax(0, 1fr) 330px 360px;
            column-gap: var(--colGap);
            row-gap: var(--rowGap);
            align-items: start;
          }
          .leftCol {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: var(--leftColW);
            min-width: var(--leftColW);
            max-width: var(--leftColW);
          }
          .midCol,
          .rightCol {
            display: flex;
            min-width: 0;
            overflow: hidden;
          }
          .summaryCol {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 0;
            overflow: hidden;
            align-items: stretch;
          }
          @media (max-width: 1250px) {
            .homeGrid {
              grid-template-columns: 1fr;
              column-gap: 0;
              row-gap: 12px;
            }
            .leftCol {
              width: 100%;
              min-width: 0;
              max-width: none;
            }
            .leftBottomCards {
              width: 100%;
              min-width: 0;
              max-width: none;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

