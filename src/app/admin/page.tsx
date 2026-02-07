"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type EventRow = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  memo: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const ADMIN_EMAIL = "gd6522@naver.com";
const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function kstTodayYYYYMMDD() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(
    kst.getUTCDate()
  )}`;
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

type Cell = { day: number | null; weekday: number; ymd: string | null };

type Notice = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  updated_at: string;
};

type WeatherAPI = {
  ok: boolean;
  locationName: string;
  updatedAt: string | null;

  today: {
    date: string;
    currentTemp: number | null;
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

function Card({
  title,
  subtitle,
  right,
  children,
  minHeight,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  minHeight?: number;
}) {
  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        background: "white",
        overflow: "hidden",
        boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
        minHeight: minHeight ?? undefined,
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #F3F4F6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, fontSize: 15, color: "#111827" }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

/** -------- 날씨 아이콘(SVG) -------- */
function WeatherIcon({ code, size = 30 }: { code: number | null; size?: number }) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 64 64",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
  };

  const c = code ?? -1;
  const isClear = c === 0;
  const isPartly = c === 1 || c === 2;
  const isFog = c === 45 || c === 48;
  const isDrizzle = c >= 51 && c <= 57;
  const isRain = (c >= 61 && c <= 67) || (c >= 80 && c <= 82);
  const isSnow = (c >= 71 && c <= 77) || (c >= 85 && c <= 86);
  const isThunder = c >= 95;

  const stroke = "#111827";
  const stroke2 = "#6B7280";

  if (isClear) {
    return (
      <svg {...common}>
        <circle cx="32" cy="32" r="11" stroke={stroke} strokeWidth="3" />
        {[...Array(8)].map((_, i) => {
          const a = (Math.PI * 2 * i) / 8;
          const x1 = 32 + Math.cos(a) * 18;
          const y1 = 32 + Math.sin(a) * 18;
          const x2 = 32 + Math.cos(a) * 26;
          const y2 = 32 + Math.sin(a) * 26;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    );
  }

  if (isPartly) {
    return (
      <svg {...common}>
        <circle cx="24" cy="26" r="9" stroke={stroke} strokeWidth="3" />
        <path
          d="M24 17 L24 12 M24 40 L24 45 M15 26 L10 26 M38 26 L43 26 M17 19 L13 15 M31 33 L35 37 M17 33 L13 37 M31 19 L35 15"
          stroke={stroke2}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M26 44H46c6 0 10-4 10-9s-4-9-10-9c-1 0-2 0-3 .3C41 22 38 19 33 19c-5 0-9 4-9 9v.2C20 29 18 32 18 36c0 4 3 8 8 8z"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (isFog) {
    return (
      <svg {...common}>
        <path
          d="M18 30c1-7 6-12 14-12 6 0 10 3 12 8 7 0 12 5 12 12 0 6-4 10-10 10H22c-6 0-10-4-10-10 0-4 2-7 6-8z"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M14 50H50" stroke={stroke2} strokeWidth="3" strokeLinecap="round" />
        <path d="M18 56H46" stroke={stroke2} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (isSnow) {
    return (
      <svg {...common}>
        <path
          d="M18 34c1-7 6-12 14-12 6 0 10 3 12 8 7 0 12 5 12 12 0 6-4 10-10 10H22c-6 0-10-4-10-10 0-4 2-7 6-8z"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {[18, 28, 38, 48].map((x, i) => (
          <g key={i}>
            <path d={`M${x} 50v10`} stroke={stroke2} strokeWidth="3" strokeLinecap="round" />
            <path d={`M${x - 4} 54l8 6`} stroke={stroke2} strokeWidth="2.5" strokeLinecap="round" />
            <path d={`M${x + 4} 54l-8 6`} stroke={stroke2} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    );
  }

  if (isThunder) {
    return (
      <svg {...common}>
        <path
          d="M18 34c1-7 6-12 14-12 6 0 10 3 12 8 7 0 12 5 12 12 0 6-4 10-10 10H22c-6 0-10-4-10-10 0-4 2-7 6-8z"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M30 48l-6 10h8l-4 10 12-16h-8l6-10h-8z" fill={stroke} />
      </svg>
    );
  }

  if (isDrizzle || isRain) {
    return (
      <svg {...common}>
        <path
          d="M18 30c1-7 6-12 14-12 6 0 10 3 12 8 7 0 12 5 12 12 0 6-4 10-10 10H22c-6 0-10-4-10-10 0-4 2-7 6-8z"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {[20, 30, 40, 50].map((x, i) => (
          <path key={i} d={`M${x} 48l-4 10`} stroke={stroke2} strokeWidth="3" strokeLinecap="round" />
        ))}
      </svg>
    );
  }

  // default: 흐림
  return (
    <svg {...common}>
      <path
        d="M18 34c1-7 6-12 14-12 6 0 10 3 12 8 7 0 12 5 12 12 0 6-4 10-10 10H22c-6 0-10-4-10-10 0-4 2-7 6-8z"
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** -------- 공지(메인) -------- */
function NoticeMainCard() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notice[]>([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notices/list", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "공지 불러오기 실패");
      setItems((json.items ?? []) as Notice[]);
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

  return (
    <Card
      title="공지사항"
      subtitle="중요한 내용은 여기서 바로 확인"
      minHeight={520}
      right={
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/admin/settings/notices"
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #E5E7EB",
              background: "white",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              fontWeight: 950,
              fontSize: 13,
              color: "#111827",
            }}
          >
            등록/수정
          </Link>
          <button
            onClick={load}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #E5E7EB",
              background: "white",
              cursor: "pointer",
              fontWeight: 950,
              fontSize: 13,
            }}
          >
            새로고침
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ color: "#6B7280", fontSize: 14 }}>불러오는 중…</div>
      ) : err ? (
        <div style={{ color: "#B91C1C", fontSize: 14 }}>{err}</div>
      ) : items.length === 0 ? (
        <div style={{ color: "#6B7280", fontSize: 14 }}>등록된 공지사항이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.slice(0, 10).map((n) => (
            <div
              key={n.id}
              style={{
                border: "1px solid #F3F4F6",
                borderRadius: 14,
                padding: 12,
                background: n.is_pinned ? "#FFF7ED" : "#FAFAFB",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 950, color: "#111827", fontSize: 15, minWidth: 0 }}>
                  {n.is_pinned ? "📌 " : ""}
                  {n.title}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
                  {new Date(n.updated_at).toLocaleDateString("ko-KR")}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {n.body}
              </div>
            </div>
          ))}
          {items.length > 10 ? <div style={{ fontSize: 12, color: "#6B7280" }}>외 {items.length - 10}건…</div> : null}
        </div>
      )}
    </Card>
  );
}

/** -------- 날씨(얇게) -------- */
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
    const [y, m, dd] = d.split("-").map(Number);
    return `${m}.${pad2(dd)}`;
  };

  return (
    <Card
      title="오늘의 날씨"
      subtitle="경기도 화성시 양감면"
      right={
        <button
          onClick={load}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid #E5E7EB",
            background: "white",
            cursor: "pointer",
            fontWeight: 950,
            fontSize: 12,
          }}
        >
          새로고침
        </button>
      }
    >
      {loading ? (
        <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중…</div>
      ) : (
        <>
          {/* TODAY */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <WeatherIcon code={w?.today.weatherCode ?? null} size={30} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 950, color: "#111827" }}>
                  {w?.today.currentTemp == null ? "-" : `${Math.round(w.today.currentTemp)}°`}
                </div>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>{w?.today.weatherText ?? "-"}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, color: "#374151" }}>
                강수확률: <b style={{ color: "#111827" }}>{w?.today.precipProbNow == null ? "-" : `${w.today.precipProbNow}%`}</b>
              </div>
              <div style={{ fontSize: 12.5, color: "#374151" }}>
                최고/최저:{" "}
                <b style={{ color: "#111827" }}>
                  {w?.today.max == null ? "-" : `${Math.round(w.today.max)}°`} / {w?.today.min == null ? "-" : `${Math.round(w.today.min)}°`}
                </b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, color: "#374151" }}>
                PM10: <b style={{ color: "#111827" }}>{w?.today.pm10 == null ? "-" : `${Math.round(w.today.pm10)}㎍/m³`}</b>
              </div>
              <div style={{ fontSize: 12.5, color: "#374151" }}>
                PM2.5: <b style={{ color: "#111827" }}>{w?.today.pm25 == null ? "-" : `${Math.round(w.today.pm25)}㎍/m³`}</b>
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: "#6B7280" }}>
              업데이트: {w?.updatedAt ? new Date(w.updatedAt).toLocaleString("ko-KR") : "-"}
            </div>
            {!w?.ok && w?.message ? <div style={{ fontSize: 12, color: "#B91C1C" }}>{w.message}</div> : null}
          </div>

          {/* D+7 (오늘 제외) */}
          <div style={{ marginTop: 12, borderTop: "1px solid #F3F4F6", paddingTop: 10 }}>
            <div style={{ fontWeight: 950, fontSize: 12.5, color: "#111827", marginBottom: 8 }}>주간예보 (D+7, 오늘 제외)</div>

            <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid #F3F4F6" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "46px 66px 1fr 56px 56px",
                  background: "#F9FAFB",
                  padding: "9px 10px",
                  fontSize: 11.5,
                  fontWeight: 950,
                  color: "#374151",
                }}
              >
                <div>요일</div>
                <div>날짜</div>
                <div>강수확률</div>
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
                    borderTop: "1px solid #F3F4F6",
                    fontSize: 12.5,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 950, color: d.dow === "일" ? "#EF4444" : "#111827" }}>{d.dow}</div>
                  <div style={{ color: "#6B7280" }}>{fmtMD(d.date)}</div>

                  {/* ✅ 강수확률 바 제거 -> 퍼센트만 표시 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <WeatherIcon code={d.weatherCode ?? null} size={18} />
                    <div style={{ fontWeight: 950, color: "#111827" }}>
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
                <div style={{ padding: 12, color: "#6B7280", fontSize: 13 }}>예보 데이터를 불러오지 못했습니다.</div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** -------- 달력 밑 3일 미리보기 -------- */
function ThreeDayPreview({ baseYMD, events }: { baseYMD: string; events: EventRow[] }) {
  const days = [0, 1, 2].map((d) => addDaysYMD(baseYMD, d));

  const grouped = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    for (const ymd of days) map[ymd] = [];
    for (const e of events) {
      if (map[e.date]) map[e.date].push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return map;
  }, [events, days]);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 950, fontSize: 13, color: "#111827", marginBottom: 8 }}>3일 미리보기</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.map((ymd) => {
          const list = grouped[ymd] ?? [];
          return (
            <div
              key={ymd}
              style={{
                border: "1px solid #F3F4F6",
                borderRadius: 14,
                padding: 10,
                background: "#FAFAFB",
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 13, color: "#111827" }}>
                {ymd} ({dowKo(ymd)}) · <span style={{ color: "#6B7280" }}>{list.length}건</span>
              </div>

              {list.length === 0 ? (
                <div style={{ marginTop: 6, color: "#6B7280", fontSize: 12 }}>등록된 일정 없음</div>
              ) : (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.slice(0, 3).map((e) => (
                    <div key={e.id} style={{ fontSize: 13, color: "#374151" }}>
                      • <b style={{ color: "#111827" }}>{e.title}</b>
                      {e.memo ? <span style={{ color: "#6B7280" }}> — {e.memo}</span> : null}
                    </div>
                  ))}
                  {list.length > 3 ? <div style={{ fontSize: 12, color: "#6B7280" }}>외 {list.length - 3}건…</div> : null}
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
  const [loadingEvents, setLoadingEvents] = useState(false);

  const mounted = useRef(false);

  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const sess = data.session;
    if (!sess) return { ok: false as const };

    const uid = sess.user.id;
    const email = sess.user.email ?? "";
    setSessionUid(uid);
    setSessionEmail(email);

    const { data: prof } = await supabase.from("profiles").select("id, is_admin").eq("id", uid).maybeSingle();

    const hardAdmin = uid === ADMIN_UID || email === ADMIN_EMAIL;
    const admin = hardAdmin || (!!prof && !!(prof as any).is_admin);
    setIsAdmin(admin);
    return { ok: true as const, admin };
  };

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    (async () => {
      setChecking(true);
      try {
        const r = await loadAdmin();
        if (!r.ok || !r.admin) setIsAdmin(false);
      } catch {
        setIsAdmin(false);
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

    const cells: Cell[] = [];
    for (let i = 0; i < start; i++) cells.push({ day: null, weekday: i, ymd: null });

    for (let d = 1; d <= dim; d++) {
      const ymd = `${ym.y}-${pad2(ym.m)}-${pad2(d)}`;
      const w = new Date(`${ymd}T00:00:00+09:00`).getDay();
      cells.push({ day: d, weekday: w, ymd });
    }
    while (cells.length % 7 !== 0) {
      const idx = cells.length % 7;
      cells.push({ day: null, weekday: idx, ymd: null });
    }
    return cells;
  }, [ym.y, ym.m]);

  const fetchMonthEvents = async () => {
    setLoadingEvents(true);
    try {
      const start = `${ym.y}-${pad2(ym.m)}-01`;
      const end = `${ym.y}-${pad2(ym.m)}-${pad2(daysInMonth(ym.y, ym.m))}`;

      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, date, title, memo, created_by, created_at, updated_at")
        .gte("date", start)
        .lte("date", end);

      if (error) throw error;
      setEvents((data ?? []) as EventRow[]);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (checking) return;
    if (!isAdmin) return;
    fetchMonthEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, checking, isAdmin, ym.y, ym.m]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) map[e.date] = (map[e.date] ?? 0) + 1;
    return map;
  }, [events]);

  const countFor = (ymd: string) => eventsByDate[ymd] ?? 0;

  if (checking || !ready) return <div style={{ padding: 16, color: "#6B7280" }}>로딩...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>권한이 없습니다.</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자 계정으로 로그인해야 접근 가능합니다.</div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>
          현재 로그인: {sessionEmail || "-"} / UID: {sessionUid || "-"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 8px", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 1700, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 360px", gap: 12, alignItems: "start" }}>
          {/* LEFT: 미니 달력 + 3일 미리보기 */}
          <div>
            <div style={{ border: "1px solid #E5E7EB", borderRadius: 16, background: "white", overflow: "hidden" }}>
              <div
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #E5E7EB",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>{monthLabel}</div>
                  <button
                    onClick={goPrev}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      border: "1px solid #E5E7EB",
                      background: "white",
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
                      border: "1px solid #E5E7EB",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                  >
                    {">"}
                  </button>
                </div>

                <button
                  onClick={goToday}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  오늘
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "6px 8px" }}>
                {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
                  <div
                    key={w}
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 950,
                      color: w === "일" ? "#EF4444" : "#374151",
                    }}
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div style={{ padding: "8px 8px 10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 6 }}>
                  {grid.map((c, idx) => {
                    const isSelected = c.ymd != null && c.ymd === selectedYMD;
                    const isSun = c.weekday === 0;
                    const count = c.ymd ? countFor(c.ymd) : 0;
                    const badgeText = count > 99 ? "99+" : String(count);

                    return (
                      <button
                        key={idx}
                        disabled={c.day == null}
                        onClick={() => c.ymd && setSelectedYMD(c.ymd)}
                        style={{
                          height: 30,
                          border: "none",
                          background: "transparent",
                          cursor: c.day != null ? "pointer" : "default",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            background: isSelected ? "#111827" : "transparent",
                            color: isSelected ? "white" : isSun ? "#EF4444" : "#111827",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 950,
                            fontSize: 12,
                            position: "relative",
                          }}
                          title={c.ymd ?? ""}
                        >
                          {c.day ?? ""}

                          {count > 0 && (
                            <span
                              style={{
                                position: "absolute",
                                top: -5,
                                right: -6,
                                minWidth: 16,
                                height: 16,
                                padding: "0 4px",
                                borderRadius: 999,
                                background: isSelected ? "white" : "#111827",
                                color: isSelected ? "#111827" : "white",
                                border: "1px solid #111827",
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

              <div style={{ borderTop: "1px solid #F3F4F6", padding: "10px 12px", fontSize: 12, color: "#6B7280" }}>
                {loadingEvents ? "일정 불러오는 중…" : "날짜를 눌러 3일 미리보기를 확인하세요."}
              </div>

              <div style={{ padding: "0 12px 12px" }}>
                <ThreeDayPreview baseYMD={selectedYMD} events={events} />
              </div>
            </div>
          </div>

          {/* CENTER: 공지 */}
          <div>
            <NoticeMainCard />
          </div>

          {/* RIGHT: 날씨 */}
          <div>
            <WeatherCard />
          </div>
        </div>

        <style jsx>{`
          @media (max-width: 1250px) {
            div[style*="grid-template-columns: 300px 1fr 360px"] {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
