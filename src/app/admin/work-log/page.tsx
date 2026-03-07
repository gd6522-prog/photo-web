"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name?: string | null;
  work_part?: string | null;
  company_name?: string | null;
  work_table?: string | null;
  join_date?: string | null;
};

type Shift = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  created_at: string;
};

type TabKey = "basic" | "detail";
type BasicRow = { profile: Profile; shift: Shift | null };
type OTs = { ot: number | null; nightOt: number | null; holidayExt: number | null };

const COMPANY_ORDER: Record<string, number> = {
  "한익스프레스": 10,
  "경산씨스템": 20,
  "더블에스잡": 30,
  "비상GLS": 40,
};
const BLOCKED_COMPANY = "한익스프레스";

const WORK_PART_ORDER_LIST = ["관리자", "박스존", "이너존", "슬라존", "경량존", "담배존", "이형존"] as const;
const WORK_PART_ORDER: Record<string, number> = Object.fromEntries(
  WORK_PART_ORDER_LIST.map((v, i) => [v, (i + 1) * 10])
) as Record<string, number>;
const DETAIL_HEAD_TOP = 22;
const DETAIL_HEAD_SUB = 18;
const DETAIL_HEAD_TOTAL = DETAIL_HEAD_TOP + DETAIL_HEAD_SUB;
const DETAIL_LEFT_WIDTHS = [72, 78, 88, 62, 72, 50] as const;
const DETAIL_LEFT_STICKY = [
  0,
  DETAIL_LEFT_WIDTHS[0],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1] + DETAIL_LEFT_WIDTHS[2],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1] + DETAIL_LEFT_WIDTHS[2] + DETAIL_LEFT_WIDTHS[3],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1] + DETAIL_LEFT_WIDTHS[2] + DETAIL_LEFT_WIDTHS[3] + DETAIL_LEFT_WIDTHS[4],
] as const;

const card: React.CSSProperties = { border: "1px solid #DDE3EA", borderRadius: 14, background: "#fff", boxShadow: "0 8px 24px rgba(15,23,42,.05)" };
const input: React.CSSProperties = { height: 38, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 10px", background: "#fff" };

function kstToday() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, lastDay: last };
}

function isDayInMonth(month: string, day: number) {
  return day >= 1 && day <= monthRange(month).lastDay;
}

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";
}

function hhmm(mins: number | null) {
  if (mins == null) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtKstTime(ts: string | null) {
  if (!ts) return "-";
  const d = new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function diffMin(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const aa = new Date(a).getTime();
  const bb = new Date(b).getTime();
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return null;
  return Math.max(0, Math.round((bb - aa) / 60000));
}

function gm(lat: number | null, lng: number | null) {
  return lat == null || lng == null ? null : `https://www.google.com/maps?q=${lat},${lng}`;
}

function statusLabel(s: Shift | null) {
  if (!s) return "미출근";
  if (s.clock_in_at && !s.clock_out_at) return "근무중";
  if (s.clock_out_at) return "퇴근";
  return "기록";
}

function wk(month: string, d: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function wkKo(month: string, d: number) {
  return ["일", "월", "화", "수", "목", "금", "토"][wk(month, d)] ?? "";
}

function isWeekend(month: string, d: number) {
  const w = wk(month, d);
  return w === 0 || w === 6;
}

function parseWorkSchedule(workTable?: string | null, workPart?: string | null) {
  const raw = String(workTable ?? "").trim();
  const m = raw.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
  const noTime = raw.replace(/\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}/g, "").trim();
  const label = (noTime.split(/\s+/)[0] || raw.split(/\s+/)[0] || String(workPart ?? "").trim() || "-").trim();

  const fallbackByLabel: Record<string, { start: string; end: string }> = {
    "조출A": { start: "06:00", end: "15:00" },
    "조출B": { start: "07:00", end: "16:00" },
    "사무": { start: "08:30", end: "17:30" },
    "현장A": { start: "09:30", end: "18:30" },
    "현장B": { start: "10:30", end: "19:30" },
    "주간": { start: "08:30", end: "17:30" },
    "후반A": { start: "09:30", end: "18:30" },
    "후반B": { start: "10:30", end: "19:30" },
  };

  const fallback = fallbackByLabel[label];
  const start = m?.[1] ?? fallback?.start ?? "09:00";
  const end = m?.[2] ?? fallback?.end ?? "18:00";
  return { label, start, end };
}

function toMin(hhmmText: string) {
  const [h, m] = hhmmText.split(":").map(Number);
  return h * 60 + m;
}

function normalizeHourByMinute(h: number, minute: number) {
  if (minute < 20) return `${h}.0`;
  if (minute < 50) return `${h}.5`;
  return `${h + 1}.0`;
}

function displayFromHHmm(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return normalizeHourByMinute(h, m);
}

function decHour(ts: string | null) {
  if (!ts) return "-";
  const d = new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000);
  return normalizeHourByMinute(d.getUTCHours(), d.getUTCMinutes());
}

function toHalfHour(v: number | null) {
  if (v == null) return null;
  const mins = Math.max(0, Math.round(v * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m < 20) return h;
  if (m < 50) return h + 0.5;
  return h + 1;
}

function one(v: number | null) {
  const hh = toHalfHour(v);
  if (hh == null) return "-";
  return hh.toFixed(1);
}

function nightMin(inAt: Date, outAt: Date) {
  if (!(inAt < outAt)) return 0;
  const kst = new Date(inAt.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const s = new Date(Date.UTC(y, m, d, 22, 0, 0) - 9 * 60 * 60 * 1000);
  const e = new Date(Date.UTC(y, m, d + 1, 6, 0, 0) - 9 * 60 * 60 * 1000);
  const a = Math.max(inAt.getTime(), s.getTime());
  const b = Math.min(outAt.getTime(), e.getTime());
  return b <= a ? 0 : Math.round((b - a) / 60000);
}

function scheduleMinutes(startHHmm: string, endHHmm: string) {
  const start = toMin(startHHmm);
  const end = toMin(endHHmm);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end > start) return end - start;
  return 24 * 60 - start + end;
}

function minusLunch(minutes: number) {
  return Math.max(0, minutes - 60);
}

function calcOT(p: { month: string; day: number; inIso: string | null; outIso: string | null; baseStart: string; baseEnd: string; holiday: boolean }): OTs {
  const { month, day, inIso, outIso, baseStart, baseEnd, holiday } = p;
  if (!inIso || !outIso) return { ot: null, nightOt: null, holidayExt: null };

  const inAt = new Date(inIso);
  const outAt = new Date(outIso);
  if (!(inAt < outAt)) return { ot: null, nightOt: null, holidayExt: null };

  const total = Math.round((outAt.getTime() - inAt.getTime()) / 60000);
  if (holiday) {
    const netTotal = minusLunch(total);
    const base = minusLunch(Math.max(0, scheduleMinutes(baseStart, baseEnd)));
    const otMin = Math.min(netTotal, base);
    const holMin = Math.max(0, netTotal - base);
    return { ot: otMin / 60, nightOt: nightMin(inAt, outAt) / 60, holidayExt: holMin / 60 };
  }

  const [y, m] = month.split("-").map(Number);
  const em = toMin(baseEnd);
  const eh = Math.floor(em / 60);
  const emn = em % 60;
  const base = new Date(Date.UTC(y, m - 1, day, eh, emn, 0) - 9 * 60 * 60 * 1000);

  if (outAt <= base) return { ot: 0, nightOt: 0, holidayExt: 0 };

  const s = new Date(Math.max(base.getTime(), inAt.getTime()));
  const otTotal = Math.round((outAt.getTime() - s.getTime()) / 60000);
  const n = nightMin(s, outAt);
  return { ot: Math.max(0, otTotal - n) / 60, nightOt: n / 60, holidayExt: 0 };
}

function isLateClockIn(params: { month: string; day: number; clockInIso: string | null; startHHmm: string; holiday: boolean }) {
  const { month, day, clockInIso, startHHmm, holiday } = params;
  if (!clockInIso || holiday || !isDayInMonth(month, day)) return false;
  const [y, m] = month.split("-").map(Number);
  const [sh, sm] = startHHmm.split(":").map(Number);
  const startAbs = new Date(Date.UTC(y, m - 1, day, sh, sm, 0) - 9 * 60 * 60 * 1000);
  return new Date(clockInIso).getTime() > startAbs.getTime();
}

function isEarlyClockOut(params: { month: string; day: number; clockOutIso: string | null; endHHmm: string; holiday: boolean }) {
  const { month, day, clockOutIso, endHHmm, holiday } = params;
  if (!clockOutIso || holiday || !isDayInMonth(month, day)) return false;
  const [y, m] = month.split("-").map(Number);
  const [eh, em] = endHHmm.split(":").map(Number);
  const endAbs = new Date(Date.UTC(y, m - 1, day, eh, em, 0) - 9 * 60 * 60 * 1000);
  return new Date(clockOutIso).getTime() < endAbs.getTime();
}

function sortProfilesLikeUserMaster(list: Profile[]) {
  return [...list].sort((a, b) => {
    const ac = COMPANY_ORDER[String(a.company_name ?? "").trim()] ?? 9999;
    const bc = COMPANY_ORDER[String(b.company_name ?? "").trim()] ?? 9999;
    if (ac !== bc) return ac - bc;

    const ap = WORK_PART_ORDER[String(a.work_part ?? "").trim()] ?? 9999;
    const bp = WORK_PART_ORDER[String(b.work_part ?? "").trim()] ?? 9999;
    if (ap !== bp) return ap - bp;

    const an = String(a.name ?? "").trim();
    const bn = String(b.name ?? "").trim();
    const byName = an.localeCompare(bn, "ko");
    if (byName !== 0) return byName;

    return String(a.id).localeCompare(String(b.id));
  });
}

export default function WorkLogPage() {
  const searchParams = useSearchParams();
  const tab: TabKey = searchParams.get("tab") === "detail" ? "detail" : "basic";
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [day, setDay] = useState(kstToday());
  const [month, setMonth] = useState(kstToday().slice(0, 7));

  const [company, setCompany] = useState("");
  const [workPart, setWorkPart] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [workTable, setWorkTable] = useState("");

  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [workPartOptions, setWorkPartOptions] = useState<string[]>([]);
  const [workTableOptions, setWorkTableOptions] = useState<string[]>([]);
  const [isCompanyAdminRole, setIsCompanyAdminRole] = useState(false);

  const [basicRows, setBasicRows] = useState<BasicRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [monthShifts, setMonthShifts] = useState<Shift[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const getAccessToken = useCallback(async () => {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (!token) throw new Error("로그인 세션이 없습니다.");
    return token;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/admin/work-log/options", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await res.json()) as {
          ok?: boolean;
          message?: string;
          isCompanyAdminRole?: boolean;
          companyOptions?: string[];
          workPartOptions?: string[];
          workTableOptions?: string[];
        };
        if (!res.ok || !payload?.ok) throw new Error(payload?.message || "옵션을 불러오지 못했습니다.");

        if (!alive) return;
        setIsCompanyAdminRole(!!payload.isCompanyAdminRole);
        setCompanyOptions(payload.companyOptions ?? []);
        setWorkPartOptions(payload.workPartOptions ?? []);
        setWorkTableOptions(payload.workTableOptions ?? []);
      } catch {
        if (!alive) return;
        setIsCompanyAdminRole(false);
        setCompanyOptions([]);
        setWorkPartOptions([]);
        setWorkTableOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getAccessToken]);

  useEffect(() => {
    if (isCompanyAdminRole && company === BLOCKED_COMPANY) setCompany("");
  }, [isCompanyAdminRole, company]);

  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
  const monthLastDay = useMemo(() => monthRange(month).lastDay, [month]);
  const detailDays = useMemo(() => Array.from({ length: monthLastDay }, (_, i) => i + 1), [monthLastDay]);
  const detailProfile = useMemo(() => profiles.find((p) => p.id === detailUserId) ?? null, [profiles, detailUserId]);

  const shiftByUserDay = useMemo(() => {
    const m = new Map<string, Map<number, Shift>>();
    for (const s of monthShifts) {
      const d = Number(s.work_date.slice(8, 10));
      if (!Number.isFinite(d)) continue;
      if (!m.has(s.user_id)) m.set(s.user_id, new Map());
      const dm = m.get(s.user_id)!;
      if (!dm.has(d)) dm.set(d, s);
    }
    return m;
  }, [monthShifts]);

  const loadBasic = useCallback(async () => {
    const token = await getAccessToken();
    const params = new URLSearchParams();
    params.set("day", day);
    if (nameQ.trim()) params.set("nameQ", nameQ.trim());
    if (company.trim()) params.set("company", company.trim());
    if (workPart.trim()) params.set("workPart", workPart.trim());
    if (workTable.trim()) params.set("workTable", workTable.trim());

    const res = await fetch(`/api/admin/work-log/basic?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await res.json()) as {
      ok?: boolean;
      message?: string;
      isCompanyAdminRole?: boolean;
      profiles?: Profile[];
      shifts?: Shift[];
    };
    if (!res.ok || !payload?.ok) throw new Error(payload?.message || "기본근태를 불러오지 못했습니다.");

    setIsCompanyAdminRole(!!payload.isCompanyAdminRole);
    const ps = sortProfilesLikeUserMaster(payload.profiles ?? []);
    const map = new Map<string, Shift>();
    for (const s of payload.shifts ?? []) {
      if (!map.has(s.user_id)) map.set(s.user_id, s);
    }
    setBasicRows(ps.map((p) => ({ profile: p, shift: map.get(p.id) ?? null })));
  }, [getAccessToken, day, nameQ, company, workPart, workTable]);

  const loadDetail = useCallback(async () => {
    const token = await getAccessToken();
    const params = new URLSearchParams();
    params.set("month", month);
    if (nameQ.trim()) params.set("nameQ", nameQ.trim());
    if (company.trim()) params.set("company", company.trim());
    if (workPart.trim()) params.set("workPart", workPart.trim());
    if (workTable.trim()) params.set("workTable", workTable.trim());

    const res = await fetch(`/api/admin/work-log/detail?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await res.json()) as {
      ok?: boolean;
      message?: string;
      isCompanyAdminRole?: boolean;
      profiles?: Profile[];
      monthShifts?: Shift[];
      holidayDates?: string[];
    };
    if (!res.ok || !payload?.ok) throw new Error(payload?.message || "상세근태를 불러오지 못했습니다.");

    setIsCompanyAdminRole(!!payload.isCompanyAdminRole);
    const ps = sortProfilesLikeUserMaster(payload.profiles ?? []);
    setProfiles(ps);
    if (!ps.length) {
      setMonthShifts([]);
      setHolidaySet(new Set());
      return;
    }
    setMonthShifts(payload.monthShifts ?? []);
    setHolidaySet(new Set(payload.holidayDates ?? []));
  }, [getAccessToken, month, nameQ, company, workPart, workTable]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (tab === "basic") await loadBasic();
      else await loadDetail();
    } catch (e: unknown) {
      const msg = typeof e === "object" && e && "message" in e ? String((e as { message?: string }).message ?? "") : String(e ?? "");
      setErr(msg || "불러오기 실패");
      if (tab === "basic") setBasicRows([]);
      else {
        setProfiles([]);
        setMonthShifts([]);
        setHolidaySet(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, [tab, loadBasic, loadDetail]);

  useEffect(() => {
    load();
  }, [load]);

  function downloadBasic() {
    const rows = basicRows.map(({ profile, shift }) => ({
      날짜: day,
      회사: profile.company_name ?? "-",
      근무구분: parseWorkSchedule(profile.work_table, profile.work_part).label ?? "-",
      파트: profile.work_part ?? "-",
      이름: profile.name ?? "(이름없음)",
      상태: statusLabel(shift),
      출근시간: fmt(shift?.clock_in_at ?? null),
      퇴근시간: fmt(shift?.clock_out_at ?? null),
      근무시간: hhmm(diffMin(shift?.clock_in_at ?? null, shift?.clock_out_at ?? null)),
    }));
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "기본근태");
    XLSX.writeFile(wb, `기본근태_${day}.xlsx`);
  }

  function downloadDetail() {
    const rows: Record<string, string | number>[] = [];
    const dayHeaders = days.map((d) => String(d).padStart(2, "0"));
    const headers = ["성명", "입사일", "소속", "파트", "근무구분", "항목", ...dayHeaders, "계"];

    for (const p of profiles) {
      const dm = shiftByUserDay.get(p.id) ?? new Map<number, Shift>();
      const schedule = parseWorkSchedule(p.work_table, p.work_part);

      const info = {
        성명: p.name ?? "(이름없음)",
        입사일: p.join_date ?? "-",
        소속: p.company_name ?? "-",
        파트: p.work_part ?? "-",
        근무구분: schedule.label ?? "-",
      };

      const rowIn: Record<string, string | number> = { ...info, 항목: "출근" };
      const rowOut: Record<string, string | number> = { ...info, 항목: "퇴근" };
      const rowOt: Record<string, string | number> = { ...info, 항목: "OT" };
      const rowNight: Record<string, string | number> = { ...info, 항목: "심야OT" };
      const rowHol: Record<string, string | number> = { ...info, 항목: "휴/연" };

      let workDays = 0;
      let totOt = 0;
      let totNight = 0;
      let totHol = 0;

      for (const dayN of days) {
        const key = String(dayN).padStart(2, "0");
        const s = dm.get(dayN) ?? null;
        const valid = isDayInMonth(month, dayN);
        const holiday = valid && (isWeekend(month, dayN) || holidaySet.has(`${month}-${key}`));
        const late = isLateClockIn({ month, day: dayN, clockInIso: s?.clock_in_at ?? null, startHHmm: schedule.start, holiday });
        const ot = calcOT({ month, day: dayN, inIso: s?.clock_in_at ?? null, outIso: s?.clock_out_at ?? null, baseStart: schedule.start, baseEnd: schedule.end, holiday });

        rowIn[key] = !valid ? "-" : s?.clock_in_at ? (late ? decHour(s.clock_in_at) : displayFromHHmm(schedule.start)) : holiday ? "휴무" : "-";
        rowOut[key] = !valid ? "-" : s?.clock_out_at ? decHour(s.clock_out_at) : holiday ? "휴무" : "-";
        rowOt[key] = !valid ? "-" : one(ot.ot);
        rowNight[key] = !valid ? "-" : one(ot.nightOt);
        rowHol[key] = !valid ? "-" : one(ot.holidayExt);

        if (s?.clock_in_at) workDays += 1;
        totOt += ot.ot ?? 0;
        totNight += ot.nightOt ?? 0;
        totHol += ot.holidayExt ?? 0;
      }

      rowIn["계"] = `${workDays}일`;
      rowOut["계"] = "-";
      rowOt["계"] = one(totOt);
      rowNight["계"] = one(totNight);
      rowHol["계"] = one(totHol);

      rows.push(rowIn, rowOut, rowOt, rowNight, rowHol);
    }

    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    const aoa: Array<Array<string | number>> = [headers];
    for (const r of rows) {
      aoa.push(headers.map((h) => (r[h] ?? "-") as string | number));
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "상세근태");
    XLSX.writeFile(wb, `상세근태_${month}.xlsx`);
  }

  return (
    <div style={{ padding: 16, maxWidth: 1920, margin: "0 auto", fontFamily: "Pretendard, system-ui, sans-serif", background: "#F3F5F8", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>근태 관리</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => (tab === "basic" ? downloadBasic() : downloadDetail())} disabled={loading || (tab === "basic" ? basicRows.length === 0 : profiles.length === 0)} style={{ ...input, height: 34, cursor: "pointer", background: "#14B8A6", color: "#fff", fontWeight: 900, border: "1px solid #0F766E", opacity: loading || (tab === "basic" ? basicRows.length === 0 : profiles.length === 0) ? 0.6 : 1 }}>엑셀 다운로드</button>
        </div>
      </div>

      <div style={{ color: "#64748B", fontSize: 13, fontWeight: 700, marginTop: 8 }}>{tab === "basic" ? `총 ${basicRows.length}명` : `총 ${profiles.length}명 / ${month}`}</div>

      <div style={{ ...card, marginTop: 12, padding: 12, display: "grid", gridTemplateColumns: "170px 220px 220px 1fr 260px auto", gap: 10, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>{tab === "basic" ? "날짜" : "월"}</span>
          {tab === "basic" ? <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={input} /> : <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={input} />}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>회사명</span>
          <select value={company} onChange={(e) => setCompany(e.target.value)} style={input}><option value="">전체</option>{companyOptions.map((x) => <option key={x}>{x}</option>)}</select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>작업파트</span>
          <select value={workPart} onChange={(e) => setWorkPart(e.target.value)} style={input}><option value="">전체</option>{workPartOptions.map((x) => <option key={x}>{x}</option>)}</select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>이름</span>
          <input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="이름 검색" style={input} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>근무테이블</span>
          <select value={workTable} onChange={(e) => setWorkTable(e.target.value)} style={input}><option value="">전체</option>{workTableOptions.map((x) => <option key={x}>{x}</option>)}</select>
        </label>

        <button onClick={load} disabled={loading} style={{ ...input, height: 38, background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer" }}>{loading ? "불러오는 중.." : "조회"}</button>
      </div>

      {err && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>{err}</div>}

      {tab === "basic" ? (
        <div style={{ ...card, marginTop: 12, overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
            <thead><tr>{["날짜", "회사", "근무", "파트", "이름", "상태", "출근", "퇴근", "근무시간", "출근위치", "퇴근위치", "상세"].map((h) => <th key={h} style={{ textAlign: "left", padding: "10px", fontSize: 12, color: "#64748B", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {!basicRows.length && !loading ? <tr><td colSpan={12} style={{ padding: 16, color: "#64748B" }}>데이터가 없습니다.</td></tr> : basicRows.map(({ profile, shift }, i) => {
                const bg = i % 2 ? "#FCFDFE" : "#fff";
                const inLink = gm(shift?.clock_in_lat ?? null, shift?.clock_in_lng ?? null);
                const outLink = gm(shift?.clock_out_lat ?? null, shift?.clock_out_lng ?? null);
                return <tr key={profile.id}>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{day}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{profile.company_name ?? "-"}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{parseWorkSchedule(profile.work_table).label ?? "-"}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{profile.work_part ?? "-"}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6", fontWeight: 900 }}>{profile.name ?? "(이름없음)"}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{statusLabel(shift)}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{fmt(shift?.clock_in_at ?? null)}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{fmt(shift?.clock_out_at ?? null)}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{hhmm(diffMin(shift?.clock_in_at ?? null, shift?.clock_out_at ?? null))}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{inLink ? <a href={inLink} target="_blank" rel="noreferrer">지도</a> : "-"}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{outLink ? <a href={outLink} target="_blank" rel="noreferrer">지도</a> : "-"}</td>
                  <td style={{ padding: "9px", background: bg, borderBottom: "1px solid #EEF2F6" }}>{shift ? <Link href={`/admin/work-log/${shift.id}`}>보기</Link> : "-"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ ...card, marginTop: 12, overflow: "auto", height: "calc(100vh - 260px)", minHeight: 420, position: "relative", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>
                {[
                  { label: "성명", width: 72 },
                  { label: "입사일", width: 78 },
                  { label: "소속", width: 88 },
                  { label: "파트", width: 62 },
                  { label: "근무구분", width: 72 },
                  { label: "항목", width: 50 },
                ].map((h, i) => (
                  <th
                    key={h.label}
                    rowSpan={2}
                    style={{
                      position: "sticky",
                      top: 0,
                      left: DETAIL_LEFT_STICKY[i],
                      zIndex: 40,
                      width: h.width,
                      maxWidth: h.width,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      background: "#14506B",
                      color: "#E2E8F0",
                      height: DETAIL_HEAD_TOTAL,
                      boxSizing: "border-box",
                      padding: "0 4px",
                      border: "1px solid #0F3347",
                      fontSize: 11,
                    }}
                  >
                    {h.label}
                  </th>
                ))}
                {days.map((d) => {
                  return (
                    <th
                      key={d}
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 30,
                        width: 29,
                        height: DETAIL_HEAD_TOP,
                        lineHeight: `${DETAIL_HEAD_TOP}px`,
                        boxSizing: "border-box",
                        background: "#14506B",
                        color: "#E2E8F0",
                        border: "1px solid #0F3347",
                        fontSize: 10,
                        padding: 0,
                      }}
                    >
                      {String(d).padStart(2, "0")}
                    </th>
                  );
                })}
                <th
                  rowSpan={2}
                  style={{
                    position: "sticky",
                    top: 0,
                    right: 0,
                    zIndex: 45,
                    width: 48,
                    height: DETAIL_HEAD_TOTAL,
                    boxSizing: "border-box",
                    background: "#C6E6F5",
                    border: "1px solid #94A3B8",
                    fontSize: 11,
                    padding: "0 2px",
                  }}
                >
                  계
                </th>
              </tr>
              <tr>
                {days.map((d) => {
                  const valid = isDayInMonth(month, d);
                  return (
                    <th
                      key={`w-${d}`}
                      style={{
                        position: "sticky",
                        top: DETAIL_HEAD_TOP,
                        zIndex: 30,
                        width: 29,
                        height: DETAIL_HEAD_SUB,
                        lineHeight: `${DETAIL_HEAD_SUB}px`,
                        boxSizing: "border-box",
                        background: "#14506B",
                        color: "#E2E8F0",
                        border: "1px solid #0F3347",
                        fontSize: 9,
                        padding: 0,
                      }}
                    >
                      {valid ? wkKo(month, d) : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {!profiles.length && !loading ? <tr><td colSpan={days.length + 7} style={{ padding: 16, color: "#64748B" }}>데이터가 없습니다.</td></tr> : profiles.map((p, idx) => {
                const dm = shiftByUserDay.get(p.id) ?? new Map<number, Shift>();
                const bg = idx % 2 ? "#fff" : "#F8FAFC";
                const schedule = parseWorkSchedule(p.work_table, p.work_part);
                const inVals: string[] = [];
                const outVals: string[] = [];
                const otVals: string[] = [];
                const nightVals: string[] = [];
                const holVals: string[] = [];
                const lateVals: boolean[] = [];
                const earlyVals: boolean[] = [];
                let wd = 0;
                let to = 0;
                let tn = 0;
                let th = 0;

                for (const d of days) {
                  const s = dm.get(d) ?? null;
                  const valid = isDayInMonth(month, d);
                  const isHol = valid && (isWeekend(month, d) || holidaySet.has(`${month}-${String(d).padStart(2, "0")}`));
                  const late = isLateClockIn({ month, day: d, clockInIso: s?.clock_in_at ?? null, startHHmm: schedule.start, holiday: isHol });
                  const ot = calcOT({ month, day: d, inIso: s?.clock_in_at ?? null, outIso: s?.clock_out_at ?? null, baseStart: schedule.start, baseEnd: schedule.end, holiday: isHol });

                  inVals.push(!valid ? "-" : s?.clock_in_at ? (late ? decHour(s.clock_in_at) : displayFromHHmm(schedule.start)) : isHol ? "휴무" : "-");
                  outVals.push(!valid ? "-" : s?.clock_out_at ? decHour(s.clock_out_at) : isHol ? "휴무" : "-");
                  otVals.push(!valid ? "-" : one(ot.ot));
                  nightVals.push(!valid ? "-" : one(ot.nightOt));
                  holVals.push(!valid ? "-" : one(ot.holidayExt));
                  lateVals.push(late);
                  earlyVals.push(isEarlyClockOut({ month, day: d, clockOutIso: s?.clock_out_at ?? null, endHHmm: schedule.end, holiday: isHol }));

                  if (s?.clock_in_at) wd += 1;
                  to += ot.ot ?? 0;
                  tn += ot.nightOt ?? 0;
                  th += ot.holidayExt ?? 0;
                }

                const rows = [
                  { key: "in", label: "출근", vals: inVals, total: `${wd}일`, late: lateVals },
                  { key: "out", label: "퇴근", vals: outVals, total: "-", early: earlyVals },
                  { key: "ot", label: "O/T", vals: otVals, total: one(to) },
                  { key: "night", label: "심야", vals: nightVals, total: one(tn) },
                  { key: "hol", label: "휴/연", vals: holVals, total: one(th) },
                ];

                return rows.map((r, ridx) => <tr key={`${p.id}-${r.key}`}>
                  {ridx === 0 && <>
                    <td rowSpan={5} title={p.name ?? ""} style={{ position: "sticky", left: DETAIL_LEFT_STICKY[0], zIndex: 20, border: "1px solid #CBD5E1", padding: "5px 3px", textAlign: "center", background: "#F3E8E8", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <button
                        onClick={() => setDetailUserId(p.id)}
                        style={{ border: "none", background: "transparent", padding: 0, margin: 0, cursor: "pointer", fontWeight: 900, fontSize: 11, color: "#0F172A", textDecoration: "underline" }}
                        title={`${p.name ?? "(이름없음)"} 상세 보기`}
                      >
                        {p.name ?? "(이름없음)"}
                      </button>
                    </td>
                    <td rowSpan={5} style={{ position: "sticky", left: DETAIL_LEFT_STICKY[1], zIndex: 20, border: "1px solid #CBD5E1", padding: "5px 2px", textAlign: "center", background: bg, fontSize: 10 }}>{p.join_date ?? "-"}</td>
                    <td rowSpan={5} title={p.company_name ?? ""} style={{ position: "sticky", left: DETAIL_LEFT_STICKY[2], zIndex: 20, border: "1px solid #CBD5E1", padding: "5px 3px", textAlign: "center", background: "#EEF2A6", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.company_name ?? "-"}</td>
                    <td rowSpan={5} style={{ position: "sticky", left: DETAIL_LEFT_STICKY[3], zIndex: 20, border: "1px solid #CBD5E1", padding: "5px 2px", textAlign: "center", background: "#EEF2A6", fontSize: 10 }}>{p.work_part ?? "-"}</td>
                    <td rowSpan={5} style={{ position: "sticky", left: DETAIL_LEFT_STICKY[4], zIndex: 20, border: "1px solid #CBD5E1", padding: "5px 2px", textAlign: "center", background: "#EEF2A6", fontSize: 10 }}>{schedule.label ?? "-"}</td>
                  </>}

                  <td style={{ position: "sticky", left: DETAIL_LEFT_STICKY[5], zIndex: 20, border: "1px solid #CBD5E1", padding: "5px 2px", textAlign: "center", background: bg, fontWeight: 900, fontSize: 10 }}>{r.label}</td>

                  {r.vals.map((v, i) => {
                    const dd = days[i];
                    const valid = isDayInMonth(month, dd);
                    const hol = valid && (isWeekend(month, dd) || holidaySet.has(`${month}-${String(dd).padStart(2, "0")}`));
                    const late = r.key === "in" && !!(r as { late?: boolean[] }).late?.[i];
                    const early = r.key === "out" && !!(r as { early?: boolean[] }).early?.[i];
                    const bgColor = late ? "#FECACA" : early ? "#DBEAFE" : hol ? "#FFF200" : bg;
                    return <td key={`${p.id}-${r.key}-${dd}`} style={{ border: "1px solid #E2E8F0", padding: "4px 1px", textAlign: "center", background: bgColor, color: v === "휴무" ? "#EF4444" : "#0F172A", fontSize: 10, fontWeight: v === "휴무" ? 900 : 700 }}>{v}</td>;
                  })}

                  <td style={{ position: "sticky", right: 0, zIndex: 20, border: "1px solid #94A3B8", padding: "5px 2px", textAlign: "center", background: "#C6E6F5", fontSize: 10, fontWeight: 900 }}>{r.total}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "detail" && detailUserId && detailProfile ? (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailUserId(null);
          }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div style={{ width: "min(980px, 100%)", maxHeight: "88vh", overflow: "auto", background: "white", borderRadius: 14, border: "1px solid #CBD5E1", boxShadow: "0 24px 56px rgba(2,6,23,.30)" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, color: "#0F172A" }}>
                {detailProfile.name ?? "(이름없음)"} 월 상세근태
                <span style={{ marginLeft: 8, color: "#64748B", fontSize: 12, fontWeight: 700 }}>{month}</span>
              </div>
              <button onClick={() => setDetailUserId(null)} style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid #CBD5E1", background: "white", cursor: "pointer", fontWeight: 900 }}>×</button>
            </div>

            <div style={{ padding: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    {["일자", "요일", "출근", "퇴근", "타결시간"].map((h) => (
                      <th key={h} style={{ border: "1px solid #CBD5E1", background: "#F8FAFC", color: "#334155", fontSize: 12, padding: "8px 6px", textAlign: "center" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailDays.map((d) => {
                    const s = (shiftByUserDay.get(detailUserId) ?? new Map<number, Shift>()).get(d) ?? null;
                    const mins = diffMin(s?.clock_in_at ?? null, s?.clock_out_at ?? null);
                    const hol = isWeekend(month, d) || holidaySet.has(`${month}-${String(d).padStart(2, "0")}`);
                    return (
                      <tr key={`detail-row-${d}`}>
                        <td style={{ border: "1px solid #E2E8F0", padding: "7px 6px", textAlign: "center", fontSize: 12, background: hol ? "#FFF9C4" : "white" }}>{String(d).padStart(2, "0")}</td>
                        <td style={{ border: "1px solid #E2E8F0", padding: "7px 6px", textAlign: "center", fontSize: 12, background: hol ? "#FFF9C4" : "white" }}>{wkKo(month, d)}</td>
                        <td style={{ border: "1px solid #E2E8F0", padding: "7px 6px", textAlign: "center", fontSize: 12 }}>{fmtKstTime(s?.clock_in_at ?? null)}</td>
                        <td style={{ border: "1px solid #E2E8F0", padding: "7px 6px", textAlign: "center", fontSize: 12 }}>{fmtKstTime(s?.clock_out_at ?? null)}</td>
                        <td style={{ border: "1px solid #E2E8F0", padding: "7px 6px", textAlign: "center", fontSize: 12, fontWeight: 800 }}>{hhmm(mins)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
