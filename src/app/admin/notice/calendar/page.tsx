"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

type HolidayRow = {
  date: string; // YYYY-MM-DD
  name: string;
  source: string | null;
};

const ADMIN_EMAIL = "gd6522@naver.com";
const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";

function normWorkPart(v: any) {
  return String(v ?? "").trim();
}

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

type Cell = { day: number | null; weekday: number; ymd: string | null; isToday: boolean };

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        height: 36,
        padding: "0 12px",
        borderRadius: 999,
        border: active ? "1px solid #111827" : "1px solid #E5E7EB",
        background: active ? "#111827" : "white",
        color: active ? "white" : "#111827",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontWeight: 950,
        fontSize: 13,
      }}
    >
      {label}
    </Link>
  );
}

export default function AdminNoticeCalendarPage() {
  const pathname = usePathname();

  const [ready, setReady] = useState(false);

  const [checking, setChecking] = useState(true);
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionUid, setSessionUid] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

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

  const mounted = useRef(false);

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

    const hardAdmin = uid === ADMIN_UID || email === ADMIN_EMAIL;
    const main = hardAdmin || (!!prof && !!(prof as any).is_admin);
    const general = normWorkPart((prof as any)?.work_part) === "관리자";

    const admin = main || general;

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
    for (let i = 0; i < start; i++) {
      cells.push({ day: null, weekday: i, ymd: null, isToday: false });
    }

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

  const monthRange = useMemo(() => {
    const start = `${ym.y}-${pad2(ym.m)}-01`;
    const endDay = daysInMonth(ym.y, ym.m);
    const end = `${ym.y}-${pad2(ym.m)}-${pad2(endDay)}`;
    return { start, end };
  }, [ym.y, ym.m]);

  const fetchMonthData = async () => {
    setLoading(true);
    try {
      const [eventRes, holidayRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, date, title, memo, created_by, created_at, updated_at")
          .gte("date", monthRange.start)
          .lte("date", monthRange.end)
          .order("date", { ascending: true })
          .order("created_at", { ascending: true }),

        supabase
          .from("holidays")
          .select("date, name, source")
          .gte("date", monthRange.start)
          .lte("date", monthRange.end)
          .order("date", { ascending: true }),
      ]);

      if (eventRes.error) throw eventRes.error;
      if (holidayRes.error) throw holidayRes.error;

      setEvents((eventRes.data ?? []) as EventRow[]);
      setHolidays((holidayRes.data ?? []) as HolidayRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (checking) return;
    if (!isAdmin) return;
    fetchMonthData();
  }, [ready, checking, isAdmin, monthRange.start, monthRange.end]);

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
    for (const h of holidays) {
      map[h.date] = h;
    }
    return map;
  }, [holidays]);

  const selectedEvents = useMemo(() => {
    return eventsByDate[selectedYMD] ?? [];
  }, [eventsByDate, selectedYMD]);

  const selectedHoliday = useMemo(() => {
    return holidaysByDate[selectedYMD] ?? null;
  }, [holidaysByDate, selectedYMD]);

  const openCreate = () => {
    setEditing(null);
    setFormDate(selectedYMD);
    setFormTitle("");
    setFormMemo("");
    setModalOpen(true);
  };

  const openEdit = (e: EventRow) => {
    setEditing(e);
    setFormDate(e.date);
    setFormTitle(e.title);
    setFormMemo(e.memo ?? "");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const saveEvent = async () => {
    const title = formTitle.trim();
    if (!title) {
      alert("제목을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("calendar_events")
          .update({
            date: formDate,
            title,
            memo: formMemo.trim() ? formMemo.trim() : null,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("calendar_events").insert({
          date: formDate,
          title,
          memo: formMemo.trim() ? formMemo.trim() : null,
          created_by: sessionUid,
        });
        if (error) throw error;
      }

      closeModal();

      const [y, m] = formDate.split("-").map(Number);
      setYm({ y, m });
      setSelectedYMD(formDate);

      await fetchMonthData();
    } catch (e: any) {
      alert(e?.message ?? "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async (e: EventRow) => {
    if (!confirm("이 일정을 삭제할까요?")) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("calendar_events").delete().eq("id", e.id);
      if (error) throw error;
      await fetchMonthData();
    } catch (err: any) {
      alert(err?.message ?? "삭제 실패");
    } finally {
      setLoading(false);
    }
  };

  const isNoticesActive = pathname === "/admin/notice/notices" || pathname.startsWith("/admin/notice/notices/");
  const isCalendarActive = pathname === "/admin/notice/calendar" || pathname.startsWith("/admin/notice/calendar/");

  if (checking || !ready) {
    return <div style={{ padding: 16, color: "#6B7280" }}>로딩...</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>권한이 없습니다.</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>
          관리자 계정으로 로그인해야 접근 가능합니다.
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>
          현재 로그인: {sessionEmail || "-"} / UID: {sessionUid || "-"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 12px", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 20 }}>공지</div>
          <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>
            공지 섹션: 달력 / 공지사항을 관리합니다.
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <TabLink href="/admin/notice/calendar" label="달력" active={isCalendarActive} />
            <TabLink href="/admin/notice/notices" label="공지사항" active={isNoticesActive} />
          </div>
        </div>

        <Link
          href="/admin"
          style={{
            height: 40,
            padding: "0 14px",
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            background: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontWeight: 950,
            color: "#111827",
          }}
        >
          메인으로
        </Link>
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 980, maxWidth: "96vw", display: "grid", gridTemplateColumns: "360px 1fr", gap: 14 }}>
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 14, background: "white", overflow: "hidden" }}>
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
                <div style={{ fontWeight: 900, fontSize: 15 }}>{monthLabel}</div>

                <button
                  onClick={goPrev}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                  aria-label="prev"
                >
                  {"<"}
                </button>
                <button
                  onClick={goNext}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                  aria-label="next"
                >
                  {">"}
                </button>
              </div>

              <button
                onClick={goToday}
                style={{
                  height: 28,
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                padding: "6px 8px",
                borderBottom: "1px solid #F3F4F6",
              }}
            >
              {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
                <div
                  key={w}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    color: w === "일" ? "#EF4444" : "#374151",
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            <div style={{ padding: "10px 8px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 6 }}>
                {grid.map((c, idx) => {
                  const isSun = c.weekday === 0;
                  const isSelected = c.ymd != null && c.ymd === selectedYMD;
                  const count = c.ymd ? (eventsByDate[c.ymd]?.length ?? 0) : 0;
                  const badgeText = count > 99 ? "99+" : String(count);
                  const isHoliday = !!(c.ymd && holidaysByDate[c.ymd]);
                  const textColor = isSelected ? "white" : isHoliday || isSun ? "#EF4444" : "#111827";

                  return (
                    <button
                      key={idx}
                      disabled={c.day == null}
                      onClick={() => c.ymd && setSelectedYMD(c.ymd)}
                      style={{
                        height: 34,
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
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          background: isSelected ? "#111827" : "transparent",
                          color: textColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          fontSize: 12,
                          position: "relative",
                          border: c.isToday && !isSelected ? "1px solid #CBD5E1" : "1px solid transparent",
                        }}
                        title={c.ymd ? (holidaysByDate[c.ymd] ? `${c.ymd} / ${holidaysByDate[c.ymd].name}` : c.ymd) : ""}
                      >
                        {c.day ?? ""}

                        {count > 0 && (
                          <span
                            style={{
                              position: "absolute",
                              top: -4,
                              right: -4,
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
                              fontWeight: 900,
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
          </div>

          <div style={{ border: "1px solid #E5E7EB", borderRadius: 14, background: "white", overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 12px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 15 }}>일정</div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>
                  선택 날짜: <b style={{ color: "#111827" }}>{selectedYMD}</b>
                </div>
                {selectedHoliday ? (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: "#EF4444" }}>
                    공휴일: {selectedHoliday.name}
                  </div>
                ) : null}
              </div>

              <button
                onClick={openCreate}
                style={{
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                일정 등록
              </button>
            </div>

            <div style={{ padding: 12 }}>
              {loading ? (
                <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중...</div>
              ) : selectedEvents.length === 0 ? (
                <div style={{ color: "#6B7280", fontSize: 13 }}>
                  {selectedHoliday ? "공휴일입니다. 등록된 일정은 없습니다." : "등록된 일정이 없습니다."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedEvents.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        border: "1px solid #E5E7EB",
                        borderRadius: 12,
                        padding: 12,
                        background: "white",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, color: "#111827", wordBreak: "break-word" }}>{e.title}</div>
                          {e.memo ? (
                            <div style={{ marginTop: 6, color: "#374151", fontSize: 13, whiteSpace: "pre-wrap" }}>
                              {e.memo}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => openEdit(e)}
                            style={{
                              height: 32,
                              padding: "0 10px",
                              borderRadius: 10,
                              border: "1px solid #E5E7EB",
                              background: "white",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            수정
                          </button>
                          <button
                            onClick={() => deleteEvent(e)}
                            style={{
                              height: 32,
                              padding: "0 10px",
                              borderRadius: 10,
                              border: "1px solid #EF4444",
                              background: "#FEE2E2",
                              color: "#EF4444",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            삭제
                          </button>
                        </div>
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
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.55)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 96vw)",
              background: "white",
              borderRadius: 14,
              border: "1px solid #E5E7EB",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 900 }}>{editing ? "일정 수정" : "일정 등록"}</div>
              <button
                onClick={closeModal}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                aria-label="close"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>날짜</div>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>제목</div>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="예: 센터 점검 / 회의 / 휴무"
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>메모(선택)</div>
                <textarea
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  placeholder="내용/상세를 적어도 됩니다."
                  rows={5}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "10px 12px",
                    fontWeight: 700,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <div style={{ padding: 14, borderTop: "1px solid #E5E7EB", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={closeModal}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                취소
              </button>

              <button
                onClick={saveEvent}
                disabled={loading}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #111827",
                  background: loading ? "#CBD5E1" : "#111827",
                  color: "white",
                  fontWeight: 900,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {editing ? "수정 저장" : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}