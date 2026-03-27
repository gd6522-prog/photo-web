"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";
import {
  CALENDAR_EVENT_TYPE_BADGE,
  CALENDAR_EVENT_TYPE_LABEL,
  calendarEventBadgeBackground,
  calendarEventBadgeBorderColor,
  dominantCalendarEventType,
  isMixedCalendarEventTypes,
  parseCalendarEventType,
  stripCalendarEventType,
  summarizeCalendarEventTypes,
  type CalendarEventType,
} from "@/lib/calendar-event-type";

type EventRow = {
  id: string;
  date: string;
  title: string;
  memo: string | null;
  event_type: CalendarEventType;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type HolidayRow = {
  date: string;
  name: string;
  source: string | null;
};

type ProfileRow = {
  is_admin?: boolean | null;
  work_part?: string | null;
};

type CalendarResponse = {
  ok?: boolean;
  message?: string;
  events?: EventRow[];
  holidays?: HolidayRow[];
};

type Cell = { day: number | null; weekday: number; ymd: string | null; isToday: boolean };

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

export default function AdminNoticeCalendarPage() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionUid, setSessionUid] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMainAdmin, setIsMainAdmin] = useState(false);

  const [todayYMD, setTodayYMD] = useState("1970-01-01");
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: 1970, m: 1 });
  const [selectedYMD, setSelectedYMD] = useState("1970-01-01");

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [formDate, setFormDate] = useState("1970-01-01");
  const [formTitle, setFormTitle] = useState("");
  const [formMemo, setFormMemo] = useState("");
  const [formEventType, setFormEventType] = useState<CalendarEventType>("general");

  const mounted = useRef(false);

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = String(data.session?.access_token ?? "").trim();
    if (!token) throw new Error("로그인 세션이 없습니다.");
    return token;
  };

  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const sess = data.session;
    if (!sess) return { ok: false as const, reason: "no-session" as const };

    const uid = sess.user.id;
    const email = sess.user.email ?? "";
    setSessionUid(uid);
    setSessionEmail(email);

    const { data: prof } = await supabase
      .from("profiles")
      .select("id, name, work_part, is_admin")
      .eq("id", uid)
      .maybeSingle();

    const profile = (prof ?? null) as ProfileRow | null;
    const hardAdmin = isMainAdminIdentity(uid, email);
    const main = hardAdmin || !!profile?.is_admin;
    const general = isGeneralAdminWorkPart(profile?.work_part);
    const admin = main || general;

    setIsMainAdmin(main);
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
    setTodayYMD(t);
    const [y, m] = t.split("-").map(Number);
    setYm({ y, m });
    setSelectedYMD(t);
    setReady(true);
  }, []);

  const monthLabel = useMemo(() => `${ym.y}. ${pad2(ym.m)}`, [ym.y, ym.m]);

  const monthRange = useMemo(() => {
    const start = `${ym.y}-${pad2(ym.m)}-01`;
    const endDay = daysInMonth(ym.y, ym.m);
    const end = `${ym.y}-${pad2(ym.m)}-${pad2(endDay)}`;
    return { start, end };
  }, [ym.y, ym.m]);

  const fetchMonthData = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ from: monthRange.start, to: monthRange.end });
      const res = await fetch(`/api/admin/calendar-month?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as CalendarResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.message || "일정 조회 실패");

      setEvents(
        (json.events ?? []).map((event) => ({
          ...event,
          memo: stripCalendarEventType(event.memo),
          event_type: parseCalendarEventType(event.memo),
        }))
      );
      setHolidays((json.holidays ?? []) as HolidayRow[]);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "일정 조회 실패");
      setEvents([]);
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || checking || !isAdmin) return;
    fetchMonthData();
  }, [ready, checking, isAdmin, monthRange.start, monthRange.end]);

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
    setTodayYMD(t);
    setSelectedYMD(t);
    const [y, m] = t.split("-").map(Number);
    setYm({ y, m });
  };

  const grid = useMemo<Cell[]>(() => {
    const start = startWeekdayOfMonth(ym.y, ym.m);
    const dim = daysInMonth(ym.y, ym.m);
    const cells: Cell[] = [];

    for (let i = 0; i < start; i++) cells.push({ day: null, weekday: i, ymd: null, isToday: false });
    for (let d = 1; d <= dim; d++) {
      const ymd = `${ym.y}-${pad2(ym.m)}-${pad2(d)}`;
      const w = new Date(`${ymd}T00:00:00+09:00`).getDay();
      cells.push({ day: d, weekday: w, ymd, isToday: ymd === todayYMD });
    }
    while (cells.length % 7 !== 0) {
      const idx = cells.length % 7;
      cells.push({ day: null, weekday: idx, ymd: null, isToday: false });
    }
    return cells;
  }, [ym.y, ym.m, todayYMD]);

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

  const selectedEvents = useMemo(() => eventsByDate[selectedYMD] ?? [], [eventsByDate, selectedYMD]);
  const selectedHoliday = useMemo(() => holidaysByDate[selectedYMD] ?? null, [holidaysByDate, selectedYMD]);

  const openCreate = () => {
    setEditing(null);
    setFormDate(selectedYMD);
    setFormTitle("");
    setFormMemo("");
    setFormEventType("general");
    setModalOpen(true);
  };

  const openEdit = (e: EventRow) => {
    setEditing(e);
    setFormDate(e.date);
    setFormTitle(e.title);
    setFormMemo(e.memo ?? "");
    setFormEventType(e.event_type);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const saveEvent = async () => {
    const title = formTitle.trim();
    if (!title) {
      alert("제목을 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/calendar-event/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editing?.id ?? undefined,
          date: formDate,
          title,
          memo: formMemo.trim(),
          event_type: formEventType,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.message || "저장 실패");

      closeModal();
      const [y, m] = formDate.split("-").map(Number);
      setYm({ y, m });
      setSelectedYMD(formDate);
      await fetchMonthData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async (e: EventRow) => {
    if (!confirm("이 일정을 삭제할까요?")) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/admin/calendar-event/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: e.id }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.message || "삭제 실패");

      await fetchMonthData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setLoading(false);
    }
  };
  if (checking || !ready) return <div style={{ padding: 16, color: "#6B7280" }}>로딩...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>권한이 없습니다.</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자 계정으로 로그인해 주세요.</div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>
          현재 로그인: {sessionEmail || "-"} / UID: {sessionUid || "-"}
        </div>
        </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, padding: "18px 12px", fontFamily: "system-ui" }}>
      <div>
        <div>
          <div style={{ fontWeight: 950, fontSize: 20 }}>공지</div>
          <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자 계정은 일정 조회, 등록, 수정, 삭제가 가능합니다.</div>
      </div>
        </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 980, maxWidth: "96vw", display: "grid", gridTemplateColumns: "360px 1fr", gap: 14 }}>
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 0, background: "white", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>{monthLabel}</div>
                <button onClick={goPrev} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #E5E7EB", background: "white", cursor: "pointer", fontWeight: 900, lineHeight: 1 }} aria-label="prev">{"<"}</button>
                <button onClick={goNext} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #E5E7EB", background: "white", cursor: "pointer", fontWeight: 900, lineHeight: 1 }} aria-label="next">{">"}</button>
              </div>
              <button onClick={goToday} style={{ height: 28, padding: "0 10px", borderRadius: 4, border: "1px solid #E5E7EB", background: "white", cursor: "pointer", fontWeight: 900, fontSize: 12 }}>오늘</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "6px 8px", borderBottom: "1px solid #F3F4F6" }}>
              {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
                <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 900, color: w === "일" ? "#EF4444" : "#374151" }}>{w}</div>
              ))}
            </div>

            <div style={{ padding: "10px 8px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 6 }}>
                {grid.map((c, idx) => {
                  const isSun = c.weekday === 0;
                  const isSelected = c.ymd != null && c.ymd === selectedYMD;
                  const dayEvents = c.ymd ? (eventsByDate[c.ymd] ?? []) : [];
                  const count = dayEvents.length;
                  const badgeText = count > 99 ? "99+" : String(count);
                  const badgeCounts = summarizeCalendarEventTypes(dayEvents.map((event) => event.event_type));
                  const dominantType = dominantCalendarEventType(dayEvents.map((event) => event.event_type));
                  const badgeBg = calendarEventBadgeBackground(badgeCounts);
                  const badgeBorder = calendarEventBadgeBorderColor(badgeCounts);
                  const mixedBadge = isMixedCalendarEventTypes(badgeCounts);
                  const isHoliday = !!(c.ymd && holidaysByDate[c.ymd]);
                  const textColor = isSelected ? "white" : isHoliday || isSun ? "#EF4444" : "#111827";

                  return (
                    <button key={idx} disabled={c.day == null} onClick={() => c.ymd && setSelectedYMD(c.ymd)} style={{ height: 34, border: "none", background: "transparent", cursor: c.day != null ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 4, background: isSelected ? "#111827" : "transparent", color: textColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, position: "relative", border: c.isToday && !isSelected ? "1px solid #CBD5E1" : "1px solid transparent" }}>
                        {c.day ?? ""}
                        {count > 0 && (
                          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 4, background: isSelected ? "white" : badgeBg, color: mixedBadge ? "#6B7280" : CALENDAR_EVENT_TYPE_BADGE[dominantType].text, border: `1px solid ${badgeBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, lineHeight: 1 }}>
                            {badgeText}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid #E5E7EB", borderRadius: 0, background: "white", overflow: "hidden" }}>
            <div style={{ padding: "12px 12px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15 }}>일정</div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>선택 날짜: <b style={{ color: "#111827" }}>{selectedYMD}</b></div>
                {selectedHoliday ? <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: "#EF4444" }}>공휴일: {selectedHoliday.name}</div> : null}
              </div>

              {isAdmin ? (
                <button onClick={openCreate} style={{ height: 34, padding: "0 12px", borderRadius: 0, border: "1px solid #111827", background: "#111827", color: "white", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>
                  일정 등록
                </button>
              ) : null}
            </div>

            <div style={{ padding: 12 }}>
              {loading ? (
                <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중...</div>
              ) : selectedEvents.length === 0 ? (
                <div style={{ color: "#6B7280", fontSize: 13 }}>{selectedHoliday ? "공휴일입니다. 등록된 일정은 없습니다." : "등록된 일정이 없습니다."}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedEvents.map((e) => (
                    <div key={e.id} style={{ border: "1px solid #E5E7EB", borderRadius: 0, padding: 12, background: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 900,
                                background: CALENDAR_EVENT_TYPE_BADGE[e.event_type].bg,
                                color: CALENDAR_EVENT_TYPE_BADGE[e.event_type].text,
                                border: `1px solid ${CALENDAR_EVENT_TYPE_BADGE[e.event_type].border}`,
                              }}
                            >
                              {CALENDAR_EVENT_TYPE_LABEL[e.event_type]}
                            </span>
                            <div style={{ fontWeight: 900, color: "#111827", wordBreak: "break-word" }}>{e.title}</div>
                          </div>
                          {e.memo ? <div style={{ marginTop: 6, color: "#374151", fontSize: 13, whiteSpace: "pre-wrap" }}>{e.memo}</div> : null}
                        </div>
                        {isAdmin ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button onClick={() => openEdit(e)} style={{ height: 32, padding: "0 10px", borderRadius: 0, border: "1px solid #E5E7EB", background: "white", fontWeight: 900, cursor: "pointer" }}>수정</button>
                            <button onClick={() => deleteEvent(e)} style={{ height: 32, padding: "0 10px", borderRadius: 0, border: "1px solid #EF4444", background: "#FEE2E2", color: "#EF4444", fontWeight: 900, cursor: "pointer" }}>삭제</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div onClick={closeModal} style={{ position: "fixed", inset: 0, background: "rgba(17, 24, 39, 0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 96vw)", background: "white", borderRadius: 0, border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>{editing ? "일정 수정" : "일정 등록"}</div>
              <button onClick={closeModal} style={{ width: 34, height: 34, borderRadius: 0, border: "1px solid #E5E7EB", background: "white", fontWeight: 900, cursor: "pointer" }} aria-label="close">X</button>
            </div>

            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>날짜</div>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 0, border: "1px solid #E5E7EB", padding: "0 12px", fontWeight: 800, outline: "none" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>제목</div>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="센터 업무 / 회의 / 입고" style={{ width: "100%", height: 40, borderRadius: 0, border: "1px solid #E5E7EB", padding: "0 12px", fontWeight: 800, outline: "none" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 8 }}>일정 유형</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["general", "new_store", "nb_transition"] as CalendarEventType[]).map((type) => {
                    const active = formEventType === type;
                    const tone = CALENDAR_EVENT_TYPE_BADGE[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormEventType(type)}
                        style={{
                          height: 34,
                          padding: "0 12px",
                          borderRadius: 4,
                          border: `1px solid ${tone.border}`,
                          background: active ? tone.bg : "white",
                          color: active ? tone.text : tone.border,
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        {CALENDAR_EVENT_TYPE_LABEL[type]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>메모</div>
                <textarea value={formMemo} onChange={(e) => setFormMemo(e.target.value)} rows={5} style={{ width: "100%", borderRadius: 0, border: "1px solid #E5E7EB", padding: "10px 12px", fontWeight: 700, outline: "none", resize: "vertical" }} />
              </div>
            </div>

            <div style={{ padding: 14, borderTop: "1px solid #E5E7EB", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={closeModal} style={{ height: 40, padding: "0 14px", borderRadius: 0, border: "1px solid #E5E7EB", background: "white", fontWeight: 900, cursor: "pointer" }}>취소</button>
              <button onClick={saveEvent} disabled={loading} style={{ height: 40, padding: "0 14px", borderRadius: 0, border: "1px solid #111827", background: loading ? "#CBD5E1" : "#111827", color: "white", fontWeight: 900, cursor: loading ? "not-allowed" : "pointer" }}>{editing ? "수정 저장" : "등록"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
