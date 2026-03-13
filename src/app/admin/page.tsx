// src/app/admin/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

const CARD_MIN_H = 520;
const WEATHER_MIN_H = 520;

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
        borderRadius: 18,
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 16px 34px rgba(2,32,46,0.10)",
        width: "100%",
        minHeight: minHeight ?? undefined,
        height: "100%",
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
  const PAGE_SIZE = 7;

  const load = async () => {
    setErr("");
    setLoading(true);
    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sessData.session?.access_token;
      if (!token) throw new Error("Missing Authorization Bearer token");

      const res = await fetch("/api/admin/notices/list", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "공지 불러오기 실패");

      const list = (json.items ?? []) as Notice[];
      setItems(list);
      setPage(1);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
              borderRadius: 999,
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
              borderRadius: 999,
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
                borderRadius: 8,
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
                borderRadius: 8,
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
                      {n.is_pinned ? "[고정] " : ""}
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
                    borderRadius: 999,
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
                    borderRadius: 999,
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

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/weather", { cache: "no-store" });
      const json = (await res.json()) as WeatherAPI;
      setW(json);
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
    load();
  }, []);

  const fmtMD = (d: string) => {
    const [, m, dd] = d.split("-").map(Number);
    return `${m}.${pad2(dd)}`;
  };
  const pm10Level = dustLevelPm10(w?.today.pm10 ?? null);
  const pm25Level = dustLevelPm25(w?.today.pm25 ?? null);
  const feelsLikeStatus = getFeelsLikeStatus(w?.today.feelsLike ?? null);

  return (
    <Card
      title="오늘의 날씨"
      subtitle="경기도 화성시 양감면"
      minHeight={WEATHER_MIN_H}
      right={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: -2, gap: 4 }}>
          <button
            onClick={load}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <WeatherIcon code={w?.today.weatherCode ?? null} size={30} />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div style={{ fontSize: 28, fontWeight: 950, color: "#111827" }}>
                      {w?.today.currentTemp == null ? "-" : `${Math.round(w.today.currentTemp)}°`}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>{w?.today.weatherText ?? "-"}</div>
                  </div>
                </div>
                <div
                  style={{
                    minWidth: 92,
                    borderRadius: 14,
                    border: `1px solid ${feelsLikeStatus.borderColor}`,
                    background: feelsLikeStatus.background,
                    boxShadow: feelsLikeStatus.boxShadow,
                    padding: "12px 10px 16px",
                    minHeight: 98,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 900, color: feelsLikeStatus.titleColor, letterSpacing: 0.2 }}>
                    체감온도({feelsLikeStatus.label})
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 26,
                      lineHeight: 1,
                      fontWeight: 950,
                      color: feelsLikeStatus.textColor,
                      textShadow: feelsLikeStatus.textColor === "#ffffff" ? "0 1px 2px rgba(0,0,0,0.22)" : "none",
                    }}
                  >
                    {w?.today.feelsLike == null ? "-" : `${Math.round(w.today.feelsLike)}°`}
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

              <div style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #d9e6ef", background: "#fff" }}>
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
                <div style={{ border: "1px solid #d3e1eb", borderRadius: 12, padding: "9px 10px", background: "#fff" }}>
                  <div style={{ fontSize: 11.5, color: "#567284", fontWeight: 700 }}>미세먼지 (PM10)</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ color: "#113247", fontSize: 13 }}>{w?.today.pm10 == null ? "-" : `${Math.round(w.today.pm10)} μg/m³`}</b>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 999,
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
                <div style={{ border: "1px solid #d3e1eb", borderRadius: 12, padding: "9px 10px", background: "#fff" }}>
                  <div style={{ fontSize: 11.5, color: "#567284", fontWeight: 700 }}>초미세먼지 (PM2.5)</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ color: "#113247", fontSize: 13 }}>{w?.today.pm25 == null ? "-" : `${Math.round(w.today.pm25)} μg/m³`}</b>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 999,
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
    <div style={{ marginTop: 2 }}>
      <div style={{ fontWeight: 950, fontSize: 13, color: "#103b53", marginBottom: 7 }}>3일 미리보기</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.map((ymd) => {
          const list = grouped[ymd] ?? [];
          const holidayName = holidayDisplayName(ymd, holidaysByDate);
          return (
            <div
              key={ymd}
              style={{
                border: "1px solid #d9e6ef",
                borderRadius: 14,
                padding: 10,
                background: "#fff",
                overflow: "hidden",
                boxShadow: "0 6px 14px rgba(2,32,46,0.06)",
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 13, color: "#113247" }}>
                {ymd} ({dowKo(ymd)}) · <span style={{ color: "#5a7588" }}>{list.length}건</span>
              </div>
              {holidayName ? (
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900, color: "#EF4444" }}>{holidayName}</div>
              ) : null}

              {list.length === 0 ? (
                <div style={{ marginTop: 6, color: "#5a7588", fontSize: 12 }}>등록된 일정 없음</div>
              ) : (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
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

      setEvents(
        (payload.events ?? []).map((event) => ({
          ...event,
          event_type: parseCalendarEventType(event.memo),
        }))
      );
      setHolidays((payload.holidays ?? []) as HolidayRow[]);
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
      pendingRedeliveryCount?: number;
    };
    if (!res.ok || !payload.ok) return;

    setPendingHazardCount(payload.pendingHazardCount ?? 0);
    setPendingRedeliveryCount(payload.pendingRedeliveryCount ?? 0);
  };

  useEffect(() => {
    if (!ready) return;
    if (checking) return;
    if (!isAdmin) return;
    fetchMonthEvents();
    fetchPendingSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, checking, isAdmin, ym.y, ym.m]);

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
              borderRadius: 999,
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
          <div className="leftCol">
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
                        borderRadius: 8,
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
                        borderRadius: 8,
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
                        borderRadius: 8,
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

              <div style={{ marginTop: 0, minHeight: 0 }}>
                <div style={{ maxHeight: 250, overflowY: "auto", paddingRight: 2 }}>
                  <ThreeDayPreview baseYMD={selectedYMD} events={events} holidaysByDate={holidaysByDate} />
                </div>
              </div>
            </Card>
          </div>

          <div className="midCol">
            <NoticeMainCard />
          </div>

          <div className="rightCol">
            <WeatherCard />
          </div>
        </div>

        <div className="leftBottomCards">
          <div
            style={{
              border: "1px solid #bdd0de",
              borderRadius: 16,
              background: "#fff",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxShadow: "0 10px 24px rgba(2,32,46,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid #d9e6ef",
                  borderRadius: 10,
                  padding: "6px 8px",
                  color: "#113247",
                  fontSize: 12,
                  fontWeight: 900,
                  background: "#fff",
                }}
              >
              <span
                style={{
                    width: 9,
                    height: 9,
                  borderRadius: 999,
                  background: pendingRedeliveryCount > 0 ? "#DC2626" : "#16A34A",
                  boxShadow:
                    pendingRedeliveryCount > 0 ? "0 0 0 3px rgba(220,38,38,0.15)" : "0 0 0 3px rgba(22,163,74,0.15)",
                  flex: "0 0 auto",
                }}
              />
              <span style={{ flex: 1, color: "#113247" }}>
                재배송 미처리 {pendingRedeliveryCount}건
              </span>
              <Link
                href="/admin/photos/delivery"
                style={{
                    width: 20,
                    height: 20,
                  borderRadius: 999,
                  border: "1px solid #c4d5e3",
                  color: "#113247",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                    fontSize: 11,
                  lineHeight: 1,
                  fontWeight: 900,
                  background: "#fff",
                }}
                title="배송사진 페이지로 이동"
              >
                &gt;
              </Link>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid #d9e6ef",
                  borderRadius: 10,
                  padding: "6px 8px",
                  color: "#113247",
                  fontSize: 12,
                  fontWeight: 900,
                  background: "#fff",
                }}
              >
              <span
                style={{
                    width: 9,
                    height: 9,
                  borderRadius: 999,
                  background: pendingHazardCount > 0 ? "#DC2626" : "#16A34A",
                  boxShadow:
                    pendingHazardCount > 0 ? "0 0 0 3px rgba(220,38,38,0.15)" : "0 0 0 3px rgba(22,163,74,0.15)",
                  flex: "0 0 auto",
                }}
              />
              <span style={{ flex: 1, color: "#113247" }}>
                위험요인 미처리 {pendingHazardCount}건
              </span>
              <Link
                href="/admin/hazards"
                style={{
                    width: 20,
                    height: 20,
                  borderRadius: 999,
                  border: "1px solid #c4d5e3",
                  color: "#113247",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                    fontSize: 11,
                  lineHeight: 1,
                  fontWeight: 900,
                  background: "#fff",
                }}
                title="위험요인 페이지로 이동"
              >
                &gt;
              </Link>
            </div>
          </div>
        </div>

        <style jsx>{`
          .homeGrid {
            display: grid;
            grid-template-columns: var(--leftColW) 1fr 360px;
            column-gap: var(--colGap);
            row-gap: var(--rowGap);
            align-items: stretch;
          }
          .leftCol {
            display: flex;
            width: var(--leftColW);
            min-width: var(--leftColW);
            max-width: var(--leftColW);
          }
          .leftBottomCards {
            margin-top: 8px;
            width: var(--leftColW);
            min-width: var(--leftColW);
            max-width: var(--leftColW);
          }
          .midCol,
          .rightCol {
            display: flex;
            height: 100%;
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

