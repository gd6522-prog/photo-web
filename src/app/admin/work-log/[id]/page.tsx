"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";


type ShiftRow = {
  id: string;
  user_id: string;
  work_date: string; // YYYY-MM-DD
  status: "open" | "closed" | "void";
  clock_in_at: string | null;
  clock_out_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  name?: string | null;
  work_part?: string | null;
};

type HolidayRow = {
  date: string; // YYYY-MM-DD
  name?: string | null;
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function monthFromWorkDate(workDate: string): string {
  return workDate.slice(0, 7);
}

function monthRange(month: string): { from: string; to: string; lastDay: number } {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr); // 1~12
  const from = `${month}-01`;
  const last = new Date(y, m, 0);
  const lastDay = last.getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to, lastDay };
}

function weekdayIndex(month: string, day: number): number {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(y, m - 1, day);
  return d.getDay(); // 0 Sun
}

function weekdayKo(month: string, day: number): string {
  const map = ["일", "월", "화", "수", "목", "금", "토"];
  return map[weekdayIndex(month, day)] ?? "";
}

function isWeekend(month: string, day: number): boolean {
  const w = weekdayIndex(month, day);
  return w === 0 || w === 6;
}

function isSunday(month: string, day: number): boolean {
  return weekdayIndex(month, day) === 0;
}

function fmtHHmm(ts: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtHours(mins: number | null): string {
  if (mins == null || mins <= 0) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ===== 기본 근무시간(고정 5개) =====
type BaseShiftKey = "06-15" | "07-16" | "0830-1730" | "0930-1800" | "1030-1830";
const BASE_SHIFTS: Array<{ key: BaseShiftKey; label: string; start: string; end: string }> = [
  { key: "06-15", label: "06:00~15:00", start: "06:00", end: "15:00" },
  { key: "07-16", label: "07:00~16:00", start: "07:00", end: "16:00" },
  { key: "0830-1730", label: "08:30~17:30", start: "08:30", end: "17:30" },
  { key: "0930-1800", label: "09:30~18:00", start: "09:30", end: "18:00" },
  { key: "1030-1830", label: "10:30~18:30", start: "10:30", end: "18:30" },
];

function toMinutesHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

/**
 * 야간 시간대(심야): 22:00~06:00
 */
function calcNightMinutes(inAt: Date, outAt: Date): number {
  if (!(inAt.getTime() < outAt.getTime())) return 0;

  // inAt의 KST 날짜 기준으로 야간 윈도우 생성
  const kstBase = new Date(inAt.getTime() + 9 * 60 * 60 * 1000);
  const y = kstBase.getUTCFullYear();
  const mo = kstBase.getUTCMonth();
  const da = kstBase.getUTCDate();

  const nightStart = new Date(Date.UTC(y, mo, da, 22, 0, 0) - 9 * 60 * 60 * 1000);
  const nightEnd = new Date(Date.UTC(y, mo, da + 1, 6, 0, 0) - 9 * 60 * 60 * 1000);

  const s = Math.max(inAt.getTime(), nightStart.getTime());
  const e = Math.min(outAt.getTime(), nightEnd.getTime());
  if (e <= s) return 0;
  return Math.round((e - s) / 60000);
}

/**
 * ✅ OT/심야OT/휴일연장 계산 규칙
 * - 휴일(토/일 + 공휴일 테이블):
 *   - 휴일연장 = 실제 근무 전체(출근~퇴근)
 *   - 심야OT = 휴일 근무 중 22:00~06:00
 *   - OT(일반) = 0
 * - 평일:
 *   - OT = 기본근무 종료 이후 ~ 실제 퇴근
 *   - 심야OT = OT 구간 중 22:00~06:00
 *   - OT(일반) = OT 전체 - 심야OT
 *   - 휴일연장 = 0
 */
function calcOTs(params: {
  month: string;
  day: number;
  inIso: string | null;
  outIso: string | null;
  baseEnd: string;
  isHoliday: boolean;
}): { ot: number | null; nightOt: number | null; holidayExt: number | null } {
  const { month, day, inIso, outIso, baseEnd, isHoliday } = params;

  if (!inIso || !outIso) return { ot: null, nightOt: null, holidayExt: null };

  const inAt = new Date(inIso);
  const outAt = new Date(outIso);
  if (!(inAt.getTime() < outAt.getTime())) return { ot: null, nightOt: null, holidayExt: null };

  const totalMin = Math.round((outAt.getTime() - inAt.getTime()) / 60000);
  if (totalMin <= 0) return { ot: null, nightOt: null, holidayExt: null };

  if (isHoliday) {
    const night = calcNightMinutes(inAt, outAt);
    return { ot: 0, nightOt: night, holidayExt: totalMin };
  }

  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);

  const baseEndMin = toMinutesHHmm(baseEnd);
  const endH = Math.floor(baseEndMin / 60);
  const endM = baseEndMin % 60;

  const baseEndAbs = new Date(Date.UTC(y, m - 1, day, endH, endM, 0) - 9 * 60 * 60 * 1000);

  if (outAt.getTime() <= baseEndAbs.getTime()) {
    return { ot: 0, nightOt: 0, holidayExt: 0 };
  }

  const otStart = new Date(Math.max(baseEndAbs.getTime(), inAt.getTime()));
  const otEnd = outAt;

  const otTotal = Math.round((otEnd.getTime() - otStart.getTime()) / 60000);
  const nightInOt = calcNightMinutes(otStart, otEnd);
  const normalOt = Math.max(0, otTotal - nightInOt);

  return { ot: normalOt, nightOt: nightInOt, holidayExt: 0 };
}

export default function WorkLogMonthTablePage() {
  const params = useParams();
  const raw = params?.id as any;
  const shiftId = Array.isArray(raw) ? raw[0] : (raw as string | undefined);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [baseShift, setBaseShift] = useState<ShiftRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [monthShifts, setMonthShifts] = useState<ShiftRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set()); // YYYY-MM-DD

  const [baseKey, setBaseKey] = useState<BaseShiftKey>("0930-1800");
  const base = useMemo(() => BASE_SHIFTS.find((x) => x.key === baseKey)!, [baseKey]);

  const range = useMemo(() => (month ? monthRange(month) : null), [month]);

  // day -> {in,out}
  const dayMap = useMemo(() => {
    const map = new Map<number, { inAt: string | null; outAt: string | null }>();
    for (const s of monthShifts) {
      const day = Number(s.work_date.slice(8, 10));
      if (!Number.isFinite(day)) continue;
      map.set(day, { inAt: s.clock_in_at, outAt: s.clock_out_at });
    }
    return map;
  }, [monthShifts]);

  async function loadBaseShift() {
    if (!shiftId || !isUuid(shiftId)) {
      setErr("잘못된 접근입니다. 목록에서 '보기'로 들어와야 합니다.");
      setBaseShift(null);
      setUserId(null);
      setMonth(null);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { data, error } = await supabase
        .from("work_shifts")
        .select("id,user_id,work_date,status,clock_in_at,clock_out_at,created_at,updated_at")
        .eq("id", shiftId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setErr("데이터 없음");
        setBaseShift(null);
        setUserId(null);
        setMonth(null);
        return;
      }

      const s = data as ShiftRow;
      setBaseShift(s);
      setUserId(s.user_id);
      setMonth(monthFromWorkDate(s.work_date));
    } catch (e: any) {
      setErr(e?.message || "불러오기 실패");
      setBaseShift(null);
      setUserId(null);
      setMonth(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthData(u: string, m: string) {
    setLoading(true);
    setErr(null);

    try {
      const r = monthRange(m);

      const [profRes, shiftsRes, holRes] = await Promise.all([
        supabase.from("profiles").select("id,name,work_part").eq("id", u).maybeSingle(),
        supabase
          .from("work_shifts")
          .select("id,user_id,work_date,status,clock_in_at,clock_out_at,created_at,updated_at")
          .eq("user_id", u)
          .gte("work_date", r.from)
          .lte("work_date", r.to)
          .order("work_date", { ascending: true }),
        supabase.from("holidays").select("date,name").gte("date", r.from).lte("date", r.to),
      ]);

      if (profRes.error) throw profRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      if (holRes.error) throw holRes.error;

      setProfile((profRes.data as any) ?? null);
      setMonthShifts(((shiftsRes.data as any) ?? []) as ShiftRow[]);

      const set = new Set<string>();
      for (const h of (holRes.data || []) as HolidayRow[]) {
        if (h?.date) set.add(h.date);
      }
      setHolidaySet(set);
    } catch (e: any) {
      setErr(e?.message || "불러오기 실패");
      setProfile(null);
      setMonthShifts([]);
      setHolidaySet(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBaseShift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId]);

  useEffect(() => {
    if (!userId || !month) return;
    loadMonthData(userId, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month]);

  const days = useMemo(() => {
    if (!range) return [];
    return Array.from({ length: range.lastDay }, (_, i) => i + 1);
  }, [range]);

  // 공휴일 포함 휴일판정 (토/일 + holidays 테이블)
  const isHoliday = useCallback(
    (d: number) => {
      if (!month) return false;
      const date = `${month}-${String(d).padStart(2, "0")}`;
      return isWeekend(month, d) || holidaySet.has(date);
    },
    [month, holidaySet]
  );

  // ✅ 일자별 계산 맵
  const otRow = useMemo(() => {
    const map = new Map<number, number | null>();
    if (!month) return map;
    for (const d of days) {
      const v = dayMap.get(d);
      const r = calcOTs({
        month,
        day: d,
        inIso: v?.inAt ?? null,
        outIso: v?.outAt ?? null,
        baseEnd: base.end,
        isHoliday: isHoliday(d),
      });
      map.set(d, r.ot);
    }
    return map;
  }, [month, days, dayMap, base.end, isHoliday]);

  const nightOtRow = useMemo(() => {
    const map = new Map<number, number | null>();
    if (!month) return map;
    for (const d of days) {
      const v = dayMap.get(d);
      const r = calcOTs({
        month,
        day: d,
        inIso: v?.inAt ?? null,
        outIso: v?.outAt ?? null,
        baseEnd: base.end,
        isHoliday: isHoliday(d),
      });
      map.set(d, r.nightOt);
    }
    return map;
  }, [month, days, dayMap, base.end, isHoliday]);

  const holidayExtRow = useMemo(() => {
    const map = new Map<number, number | null>();
    if (!month) return map;
    for (const d of days) {
      const v = dayMap.get(d);
      const r = calcOTs({
        month,
        day: d,
        inIso: v?.inAt ?? null,
        outIso: v?.outAt ?? null,
        baseEnd: base.end,
        isHoliday: isHoliday(d),
      });
      map.set(d, r.holidayExt);
    }
    return map;
  }, [month, days, dayMap, base.end, isHoliday]);

  // ✅ 합계 계산(분 합)
  function sumMap(m: Map<number, number | null>): number {
    let s = 0;
    for (const d of days) {
      const v = m.get(d);
      if (typeof v === "number" && v > 0) s += v;
    }
    return s;
  }

  const totalOt = useMemo(() => sumMap(otRow), [otRow, days]);
  const totalNightOt = useMemo(() => sumMap(nightOtRow), [nightOtRow, days]);
  const totalHolidayExt = useMemo(() => sumMap(holidayExtRow), [holidayExtRow, days]);

  // 스타일 헬퍼: 일요일 컬럼 음영
  const sundayBg = "rgba(255,0,0,0.06)";

  return (
    <div style={{ padding: 16, maxWidth: 1900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>근태 상세(월 단위)</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/admin/work-log"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              fontWeight: 900,
            }}
          >
            목록
          </Link>

          <button
            onClick={() => {
              if (userId && month) loadMonthData(userId, month);
            }}
            disabled={loading || !userId || !month}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 900,
              opacity: !userId || !month ? 0.5 : 1,
            }}
          >
            {loading ? "불러오는 중..." : "조회"}
          </button>
        </div>
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(255,0,0,0.06)",
            border: "1px solid rgba(255,0,0,0.18)",
            color: "rgba(120,0,0,0.9)",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {/* 상단 정보 */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>이름</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{profile?.name || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>파트</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{profile?.work_part || "-"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>월</div>
            <input
              type="month"
              value={month ?? ""}
              onChange={(e) => setMonth(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>기본근무</div>
            <select
              value={baseKey}
              onChange={(e) => setBaseKey(e.target.value as BaseShiftKey)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)" }}
            >
              {BASE_SHIFTS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ✅ 엑셀형 월 근태표 + 합계 + 일요일 음영 */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <thead>
            {/* 날짜 헤더 */}
            <tr>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 2,
                  textAlign: "left",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  opacity: 0.85,
                  width: 90,
                }}
              >
                구분
              </th>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                return (
                  <th
                    key={`d-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "10px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      opacity: 0.85,
                      minWidth: 44,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {String(d).padStart(2, "0")}
                  </th>
                );
              })}

              {/* ✅ 합계 컬럼 */}
              <th
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 2,
                  textAlign: "center",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  opacity: 0.85,
                  minWidth: 70,
                }}
              >
                합계
              </th>
            </tr>

            {/* 요일 헤더 */}
            <tr>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 2,
                  textAlign: "left",
                  padding: "8px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  opacity: 0.65,
                }}
              >
                요일
              </th>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                return (
                  <th
                    key={`w-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "8px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      opacity: 0.65,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {month ? weekdayKo(month, d) : ""}
                  </th>
                );
              })}

              <th
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 2,
                  textAlign: "center",
                  padding: "8px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  opacity: 0.65,
                }}
              >
                -
              </th>
            </tr>
          </thead>

          <tbody>
            {/* 출근 */}
            <tr>
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 1,
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                출근
              </td>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                const v = dayMap.get(d)?.inAt ?? null;
                return (
                  <td
                    key={`in-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "10px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontSize: 12,
                      fontWeight: 800,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {fmtHHmm(v)}
                  </td>
                );
              })}

              <td
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 1,
                  textAlign: "center",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  opacity: 0.5,
                }}
              >
                -
              </td>
            </tr>

            {/* 퇴근 */}
            <tr>
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 1,
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                퇴근
              </td>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                const v = dayMap.get(d)?.outAt ?? null;
                return (
                  <td
                    key={`out-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "10px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontSize: 12,
                      fontWeight: 800,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {fmtHHmm(v)}
                  </td>
                );
              })}

              <td
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 1,
                  textAlign: "center",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  opacity: 0.5,
                }}
              >
                -
              </td>
            </tr>

            {/* OT */}
            <tr>
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 1,
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                OT
              </td>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                return (
                  <td
                    key={`ot-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "10px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontSize: 12,
                      fontWeight: 900,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {fmtHours(otRow.get(d) ?? null)}
                  </td>
                );
              })}

              <td
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 1,
                  textAlign: "center",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {fmtHours(totalOt)}
              </td>
            </tr>

            {/* 심야OT */}
            <tr>
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 1,
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                심야OT
              </td>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                return (
                  <td
                    key={`not-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "10px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontSize: 12,
                      fontWeight: 900,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {fmtHours(nightOtRow.get(d) ?? null)}
                  </td>
                );
              })}

              <td
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 1,
                  textAlign: "center",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {fmtHours(totalNightOt)}
              </td>
            </tr>

            {/* 휴일연장 */}
            <tr>
              <td
                style={{
                  position: "sticky",
                  left: 0,
                  background: "white",
                  zIndex: 1,
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                휴일연장
              </td>

              {days.map((d) => {
                const sun = month ? isSunday(month, d) : false;
                return (
                  <td
                    key={`hol-${d}`}
                    style={{
                      textAlign: "center",
                      padding: "10px 6px",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      fontSize: 12,
                      fontWeight: 900,
                      background: sun ? sundayBg : "white",
                    }}
                  >
                    {fmtHours(holidayExtRow.get(d) ?? null)}
                  </td>
                );
              })}

              <td
                style={{
                  position: "sticky",
                  right: 0,
                  background: "white",
                  zIndex: 1,
                  textAlign: "center",
                  padding: "10px 10px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {fmtHours(totalHolidayExt)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {baseShift ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
          기준 기록: {baseShift.work_date} / shift_id: <span style={{ fontFamily: "monospace" }}>{baseShift.id}</span>
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
        <b>계산 기준</b>
        <br />
        • 평일: OT는 기본근무 <b>종료 이후</b>부터 계산, 그 중 22:00~06:00은 심야OT로 분리
        <br />
        • 휴일(토/일 + 공휴일): 근무 전체는 휴일연장, 그 중 22:00~06:00은 심야OT에도 표시
        <br />• 일요일 컬럼만 자동 음영 처리
      </div>
    </div>
  );
}