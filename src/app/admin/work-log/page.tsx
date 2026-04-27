"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  employment_type?: string | null;
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
const DETAIL_LEFT_WIDTHS = [88, 78, 88, 62, 72, 50] as const;
const DETAIL_LEFT_STICKY = [
  0,
  DETAIL_LEFT_WIDTHS[0],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1] + DETAIL_LEFT_WIDTHS[2],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1] + DETAIL_LEFT_WIDTHS[2] + DETAIL_LEFT_WIDTHS[3],
  DETAIL_LEFT_WIDTHS[0] + DETAIL_LEFT_WIDTHS[1] + DETAIL_LEFT_WIDTHS[2] + DETAIL_LEFT_WIDTHS[3] + DETAIL_LEFT_WIDTHS[4],
] as const;

const card: React.CSSProperties = { background: "#fff", borderRadius: 10, border: "1px solid #E8EDF2", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" };
const inp: React.CSSProperties = { height: 38, borderRadius: 7, border: "1px solid #D1D9E0", padding: "0 11px", background: "#fff", fontSize: 13, color: "#1E293B", outline: "none", boxSizing: "border-box" as const, width: "100%" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#64748B", marginBottom: 5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" as const };

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

function kstHHmm(ts: string | null) {
  if (!ts) return "";
  const d = new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function sanitizeHHmmInput(raw: string): string {
  const cleaned = raw.replace(/[^\d:]/g, "");
  if (cleaned.includes(":")) return cleaned.slice(0, 5);
  if (cleaned.length <= 2) return cleaned;
  return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
}

function isValidHHmm(v: string): boolean {
  if (!v) return true;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  return h >= 0 && h <= 23 && mn >= 0 && mn <= 59;
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
  const [isMainAdmin, setIsMainAdmin] = useState(false);

  const [basicRows, setBasicRows] = useState<BasicRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [monthShifts, setMonthShifts] = useState<Shift[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<number, { in: string; out: string }>>({});
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

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
  const canEditShift = isMainAdmin || isCompanyAdminRole;

  const attendanceSummary = useMemo(() => {
    type Bucket = { regular: number; temporary: number };
    const map = new Map<string, Bucket>();
    let totalRegular = 0;
    let totalTemporary = 0;
    for (const { profile, shift } of basicRows) {
      if (!shift?.clock_in_at) continue;
      const part = String(profile.work_part ?? "").trim() || "(미지정)";
      const isTemp = profile.employment_type === "temporary";
      const cur = map.get(part) ?? { regular: 0, temporary: 0 };
      if (isTemp) {
        cur.temporary += 1;
        totalTemporary += 1;
      } else {
        cur.regular += 1;
        totalRegular += 1;
      }
      map.set(part, cur);
    }
    const rows = Array.from(map.entries()).sort(([a], [b]) => {
      const ao = WORK_PART_ORDER[a] ?? 9999;
      const bo = WORK_PART_ORDER[b] ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.localeCompare(b, "ko");
    });
    return { rows, totalRegular, totalTemporary };
  }, [basicRows]);

  const orderedProfiles = useMemo(() => {
    if (!customOrder.length) return profiles;
    const remaining = new Map(profiles.map((p) => [p.id, p]));
    const out: Profile[] = [];
    for (const id of customOrder) {
      const p = remaining.get(id);
      if (p) {
        out.push(p);
        remaining.delete(id);
      }
    }
    for (const p of profiles) {
      if (remaining.has(p.id)) out.push(p);
    }
    return out;
  }, [profiles, customOrder]);

  const persistCustomOrder = useCallback(
    async (next: string[]) => {
      setCustomOrder(next);
      try {
        const token = await getAccessToken();
        await fetch("/api/admin/work-log/detail-order", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ order: next }),
        });
      } catch {
        // 저장 실패 시 다음 조회 때 서버 값으로 복구됨
      }
    },
    [getAccessToken]
  );

  const reorderProfile = useCallback(
    (sourceId: string, targetId: string) => {
      if (!sourceId || sourceId === targetId) return;
      const ids = orderedProfiles.map((p) => p.id);
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      const next = ids.slice();
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      void persistCustomOrder(next);
    },
    [orderedProfiles, persistCustomOrder]
  );

  const resetOrder = useCallback(() => {
    void persistCustomOrder([]);
  }, [persistCustomOrder]);

  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pending: boolean;
    active: boolean;
    sourceId: string;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    const findRowUid = (clientX: number, clientY: number): string | null => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const tr = el?.closest("tr[data-uid]") as HTMLElement | null;
      return tr?.dataset.uid ?? null;
    };

    const onMove = (e: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      if (!st.active) {
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        st.pending = false;
        st.active = true;
        setDragSourceId(st.sourceId);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      const target = findRowUid(e.clientX, e.clientY);
      if (target && target !== st.sourceId) setDragOverId(target);
      else setDragOverId(null);
    };

    const onUp = (e: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      if (st.active) {
        const target = findRowUid(e.clientX, e.clientY);
        if (target && target !== st.sourceId) reorderProfile(st.sourceId, target);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragSourceId(null);
        setDragOverId(null);
      } else if (st.pending) {
        setDetailUserId(st.sourceId);
      }
      dragStateRef.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [reorderProfile]);

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
      isMainAdmin?: boolean;
      profiles?: Profile[];
      monthShifts?: Shift[];
      holidayDates?: string[];
      customOrder?: string[];
    };
    if (!res.ok || !payload?.ok) throw new Error(payload?.message || "상세근태를 불러오지 못했습니다.");

    setIsCompanyAdminRole(!!payload.isCompanyAdminRole);
    setIsMainAdmin(!!payload.isMainAdmin);
    setCustomOrder(Array.isArray(payload.customOrder) ? payload.customOrder : []);
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

  useEffect(() => {
    setEditDraft({});
    setEditError(null);
  }, [detailUserId, month]);

  const saveShift = useCallback(
    async (day: number) => {
      if (!detailUserId) return;
      const draft = editDraft[day] ?? { in: "", out: "" };
      const workDate = `${month}-${String(day).padStart(2, "0")}`;
      setSavingDay(day);
      setEditError(null);
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/admin/work-log/shift", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: detailUserId,
            work_date: workDate,
            clock_in_at: draft.in.trim() || null,
            clock_out_at: draft.out.trim() || null,
          }),
        });
        const payload = (await res.json()) as { ok?: boolean; message?: string; shift?: Shift };
        if (!res.ok || !payload?.ok || !payload.shift) {
          throw new Error(payload?.message || "저장에 실패했습니다.");
        }
        const saved = payload.shift;
        setMonthShifts((prev) => {
          const idx = prev.findIndex((s) => s.id === saved.id);
          if (idx >= 0) {
            const copy = prev.slice();
            copy[idx] = { ...prev[idx], ...saved };
            return copy;
          }
          return [saved, ...prev];
        });
        setEditDraft((prev) => {
          const next = { ...prev };
          delete next[day];
          return next;
        });
      } catch (e: unknown) {
        const msg = typeof e === "object" && e && "message" in e ? String((e as { message?: string }).message ?? "") : String(e ?? "");
        setEditError(msg || "저장 실패");
      } finally {
        setSavingDay(null);
      }
    },
    [detailUserId, editDraft, month, getAccessToken]
  );

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

    for (const p of orderedProfiles) {
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

  const statusChip = (s: Shift | null) => {
    const label = statusLabel(s);
    const styles: Record<string, React.CSSProperties> = {
      "미출근": { background: "#F1F5F9", color: "#94A3B8" },
      "근무중": { background: "#ECFDF5", color: "#065F46" },
      "퇴근":   { background: "#EFF6FF", color: "#1D4ED8" },
      "기록":   { background: "#FEF9C3", color: "#854D0E" },
    };
    const s2 = styles[label] ?? styles["기록"];
    return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, ...s2 }}>{label}</span>;
  };

  const TD: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151", whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1920, margin: "0 auto", fontFamily: "Pretendard, system-ui, sans-serif", color: "#1E293B" }}>

      {/* ── 헤더 ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A" }}>근태 관리</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94A3B8" }}>
            {tab === "basic" ? `기본근태 · ${day} · 총 ${basicRows.length}명` : `상세근태 · ${month} · 총 ${profiles.length}명`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* 탭 토글 */}
          <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3, gap: 2 }}>
            {(["basic", "detail"] as const).map((t) => (
              <Link key={t} href={`?tab=${t}`} style={{
                display: "inline-block", height: 32, padding: "0 16px", lineHeight: "32px",
                borderRadius: 6, textDecoration: "none", fontWeight: 700, fontSize: 13,
                background: tab === t ? "#1E293B" : "transparent",
                color: tab === t ? "#fff" : "#64748B",
              }}>
                {t === "basic" ? "기본근태" : "상세근태"}
              </Link>
            ))}
          </div>
          {tab === "detail" && customOrder.length > 0 && (
            <button
              onClick={resetOrder}
              title="저장된 사용자 정의 순서를 초기화하고 기본 정렬로 되돌립니다."
              style={{ height: 38, padding: "0 14px", borderRadius: 7, border: "1px solid #CBD5E1", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              정렬초기화
            </button>
          )}
          <button
            onClick={() => (tab === "basic" ? downloadBasic() : downloadDetail())}
            disabled={loading || (tab === "basic" ? basicRows.length === 0 : profiles.length === 0)}
            style={{ height: 38, padding: "0 16px", borderRadius: 7, border: "none", background: "#0F766E", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: loading || (tab === "basic" ? basicRows.length === 0 : profiles.length === 0) ? 0.5 : 1 }}
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* ── 필터 카드 ── */}
      <div style={{ ...card, padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <div style={lbl}>{tab === "basic" ? "날짜" : "월"}</div>
            {tab === "basic"
              ? <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={inp} />
              : <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inp} />}
          </div>
          <div>
            <div style={lbl}>회사명</div>
            <select value={company} onChange={(e) => setCompany(e.target.value)} style={inp}>
              <option value="">전체</option>
              {companyOptions.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>작업파트</div>
            <select value={workPart} onChange={(e) => setWorkPart(e.target.value)} style={inp}>
              <option value="">전체</option>
              {workPartOptions.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>근무테이블</div>
            <select value={workTable} onChange={(e) => setWorkTable(e.target.value)} style={inp}>
              <option value="">전체</option>
              {workTableOptions.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>이름</div>
            <input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="이름 검색" style={inp} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <button onClick={load} disabled={loading} style={{ height: 38, padding: "0 20px", borderRadius: 7, border: "none", background: "#1E293B", color: "#fff", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {loading ? "불러오는 중..." : "조회"}
          </button>
        </div>
      </div>

      {err && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>{err}</div>}

      {tab === "basic" && (
        <div style={{ ...card, padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: attendanceSummary.rows.length ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>현재 출근인원</span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>{day} 기준 · 출근 기록 보유 인원</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ padding: "4px 12px", borderRadius: 20, background: "#ECFDF5", color: "#065F46", fontSize: 12, fontWeight: 800 }}>정규직 {attendanceSummary.totalRegular}명</span>
              <span style={{ padding: "4px 12px", borderRadius: 20, background: "#FFF7ED", color: "#9A3412", fontSize: 12, fontWeight: 800 }}>임시직 {attendanceSummary.totalTemporary}명</span>
              <span style={{ padding: "4px 12px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", fontSize: 12, fontWeight: 800 }}>합계 {attendanceSummary.totalRegular + attendanceSummary.totalTemporary}명</span>
            </div>
          </div>
          {attendanceSummary.rows.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>출근 기록이 있는 인원이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {attendanceSummary.rows.map(([part, b]) => (
                <div key={part} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, border: "1px solid #E8EDF2", background: "#F8FAFC" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>{part}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#065F46" }}>정규직 {b.regular}명</span>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>·</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#9A3412" }}>임시직 {b.temporary}명</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "basic" ? (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["날짜", "회사", "근무구분", "파트", "이름", "상태", "출근", "퇴근", "근무시간", "출근위치", "퇴근위치", "상세"].map((h) => (
                    <th key={h} style={{ ...TD, padding: "10px 12px", fontWeight: 700, color: "#64748B", fontSize: 12, textAlign: "left", borderBottom: "2px solid #E8EDF2" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!basicRows.length && !loading ? (
                  <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>데이터가 없습니다.</td></tr>
                ) : basicRows.map(({ profile, shift }) => {
                  const inLink = gm(shift?.clock_in_lat ?? null, shift?.clock_in_lng ?? null);
                  const outLink = gm(shift?.clock_out_lat ?? null, shift?.clock_out_lng ?? null);
                  const st = statusLabel(shift);
                  return (
                    <tr key={profile.id} style={{ background: "#fff" }}>
                      <td style={{ ...TD, color: "#94A3B8", fontSize: 12 }}>{day}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{profile.company_name ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{parseWorkSchedule(profile.work_table).label ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{profile.work_part ?? "-"}</td>
                      <td style={{ ...TD, fontWeight: 700, color: "#0F172A" }}>{profile.name ?? "(이름없음)"}</td>
                      <td style={TD}>{statusChip(shift)}</td>
                      <td style={{ ...TD, color: st === "미출근" ? "#CBD5E1" : "#0F172A" }}>{fmt(shift?.clock_in_at ?? null)}</td>
                      <td style={{ ...TD, color: st === "미출근" || st === "근무중" ? "#CBD5E1" : "#0F172A" }}>{fmt(shift?.clock_out_at ?? null)}</td>
                      <td style={{ ...TD, fontWeight: 700 }}>{hhmm(diffMin(shift?.clock_in_at ?? null, shift?.clock_out_at ?? null))}</td>
                      <td style={TD}>
                        {inLink ? <a href={inLink} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>지도</a> : <span style={{ color: "#CBD5E1" }}>-</span>}
                      </td>
                      <td style={TD}>
                        {outLink ? <a href={outLink} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>지도</a> : <span style={{ color: "#CBD5E1" }}>-</span>}
                      </td>
                      <td style={TD}>
                        {shift ? <Link href={`/admin/work-log/${shift.id}`} style={{ color: "#6366F1", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>보기</Link> : <span style={{ color: "#CBD5E1" }}>-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {basicRows.length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#94A3B8", textAlign: "right" }}>
              총 {basicRows.length.toLocaleString()}명
            </div>
          )}
        </div>
      ) : (
        <div ref={detailScrollRef} style={{ ...card, marginTop: 12, overflow: "auto", height: "calc(100vh - 260px)", minHeight: 420, position: "relative", padding: 0 }}>
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
              {!orderedProfiles.length && !loading ? <tr><td colSpan={days.length + 7} style={{ padding: 16, color: "#64748B" }}>데이터가 없습니다.</td></tr> : orderedProfiles.map((p, idx) => {
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

                const isDragging = dragSourceId === p.id;
                const isDropTarget = !!dragSourceId && dragOverId === p.id && dragSourceId !== p.id;
                const dropAbove = isDropTarget && (() => {
                  const ids = orderedProfiles.map((x) => x.id);
                  return ids.indexOf(dragSourceId!) > ids.indexOf(p.id);
                })();
                const dropBelow = isDropTarget && !dropAbove;
                return rows.map((r, ridx) => <tr
                  key={`${p.id}-${r.key}`}
                  data-uid={p.id}
                  style={{ opacity: isDragging ? 0.4 : 1 }}
                >
                  {ridx === 0 && <>
                    <td
                      rowSpan={5}
                      title={`${p.name ?? "(이름없음)"} (꾹 눌러 위아래로 드래그하면 순서 변경, 짧게 클릭하면 상세 보기. 드래그 중 마우스휠로 스크롤)`}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        dragStateRef.current = {
                          pending: true,
                          active: false,
                          sourceId: p.id,
                          startX: e.clientX,
                          startY: e.clientY,
                        };
                      }}
                      style={{
                        position: "sticky",
                        left: DETAIL_LEFT_STICKY[0],
                        zIndex: 20,
                        border: "1px solid #CBD5E1",
                        borderTop: dropAbove ? "3px solid #0EA5E9" : "1px solid #CBD5E1",
                        borderBottom: dropBelow ? "3px solid #0EA5E9" : "1px solid #CBD5E1",
                        padding: "5px 6px",
                        textAlign: "center",
                        background: isDropTarget ? "#FEF3C7" : "#F3E8E8",
                        fontWeight: 900,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        cursor: isDragging ? "grabbing" : "grab",
                        userSelect: "none",
                        textDecoration: "underline",
                        color: "#0F172A",
                      }}
                    >
                      {p.name ?? "(이름없음)"}
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
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailUserId(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div style={{ width: canEditShift ? "min(720px, 100%)" : "min(520px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px rgba(2,6,23,0.28)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{detailProfile.name ?? "(이름없음)"}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#94A3B8" }}>
                  {month} 월 상세근태{canEditShift ? ` · 출퇴근 수정 가능 (${isMainAdmin ? "메인관리자" : "업체관리자"})` : ""}
                </div>
              </div>
              <button onClick={() => setDetailUserId(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8EDF2", background: "#F8FAFC", fontSize: 16, cursor: "pointer", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            {editError && (
              <div style={{ margin: "10px 22px 0", padding: "8px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 12, fontWeight: 700 }}>{editError}</div>
            )}
            <div style={{ overflowY: "auto", padding: "14px 22px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {(canEditShift ? ["일자", "요일", "출근", "퇴근", "근무시간", "저장"] : ["일자", "요일", "출근", "퇴근", "근무시간"]).map((h) => (
                      <th key={h} style={{ padding: "9px 10px", fontWeight: 700, color: "#64748B", fontSize: 12, textAlign: "center", borderBottom: "2px solid #E8EDF2" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailDays.map((d) => {
                    const s = (shiftByUserDay.get(detailUserId) ?? new Map<number, Shift>()).get(d) ?? null;
                    const mins = diffMin(s?.clock_in_at ?? null, s?.clock_out_at ?? null);
                    const hol = isWeekend(month, d) || holidaySet.has(`${month}-${String(d).padStart(2, "0")}`);
                    const dayBg = hol ? "#FFFBEB" : "#fff";
                    const baseIn = kstHHmm(s?.clock_in_at ?? null);
                    const baseOut = kstHHmm(s?.clock_out_at ?? null);
                    const draft = editDraft[d];
                    const inVal = draft?.in ?? baseIn;
                    const outVal = draft?.out ?? baseOut;
                    const dirty = !!draft && (draft.in !== baseIn || draft.out !== baseOut);
                    const valid = isValidHHmm(inVal) && isValidHHmm(outVal);
                    const saving = savingDay === d;
                    return (
                      <tr key={`detail-row-${d}`} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "8px 10px", textAlign: "center", background: dayBg, fontWeight: 700, color: "#0F172A" }}>{String(d).padStart(2, "0")}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", background: dayBg, color: hol ? "#DC2626" : "#64748B", fontWeight: hol ? 800 : 600 }}>{wkKo(month, d)}</td>
                        {canEditShift ? (
                          <>
                            <td style={{ padding: "6px 6px", textAlign: "center" }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="00:00"
                                maxLength={5}
                                value={inVal}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, [d]: { in: sanitizeHHmmInput(e.target.value), out: prev[d]?.out ?? baseOut } }))}
                                style={{ height: 30, padding: "0 8px", borderRadius: 6, border: `1px solid ${isValidHHmm(inVal) ? "#D1D9E0" : "#FCA5A5"}`, fontSize: 12, color: "#0F172A", width: 80, background: "#fff", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
                              />
                            </td>
                            <td style={{ padding: "6px 6px", textAlign: "center" }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="00:00"
                                maxLength={5}
                                value={outVal}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, [d]: { in: prev[d]?.in ?? baseIn, out: sanitizeHHmmInput(e.target.value) } }))}
                                style={{ height: 30, padding: "0 8px", borderRadius: 6, border: `1px solid ${isValidHHmm(outVal) ? "#D1D9E0" : "#FCA5A5"}`, fontSize: 12, color: "#0F172A", width: 80, background: "#fff", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: "#374151" }}>{fmtKstTime(s?.clock_in_at ?? null)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: "#374151" }}>{fmtKstTime(s?.clock_out_at ?? null)}</td>
                          </>
                        )}
                        <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: mins ? "#1D4ED8" : "#CBD5E1" }}>{hhmm(mins)}</td>
                        {canEditShift && (
                          <td style={{ padding: "6px 6px", textAlign: "center" }}>
                            <button
                              onClick={() => saveShift(d)}
                              disabled={!dirty || !valid || saving}
                              style={{
                                height: 28, padding: "0 10px", borderRadius: 6, border: "none",
                                background: dirty && valid ? "#0F766E" : "#E2E8F0",
                                color: dirty && valid ? "#fff" : "#94A3B8",
                                fontWeight: 700, fontSize: 12,
                                cursor: !dirty || !valid || saving ? "not-allowed" : "pointer",
                                opacity: saving ? 0.6 : 1,
                              }}
                            >
                              {saving ? "저장중" : "저장"}
                            </button>
                          </td>
                        )}
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
