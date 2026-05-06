"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import "react-day-picker/style.css";

type Props = {
  start: string;          // YYYY-MM-DD
  end: string;            // YYYY-MM-DD
  maxYmd?: string;        // 미래 날짜 차단용 (보통 today KST)
  onApply: (start: string, end: string) => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function todayKstYmd(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function startOfWeekMon(d: Date): Date {
  // 한국식 월요일 시작
  const r = new Date(d);
  const day = r.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function DateRangePicker({ start, end, maxYmd, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState(start);
  const [tempEnd, setTempEnd] = useState(end);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  // open 상태 진입 시 props 값으로 동기화
  useEffect(() => {
    if (open) {
      setTempStart(start);
      setTempEnd(end);
    }
  }, [open, start, end]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const today = useMemo(() => todayKstYmd(), []);
  const maxDate = useMemo(() => parseYmd(maxYmd ?? today) ?? undefined, [maxYmd, today]);

  // 프리셋 정의
  const setRange = (s: Date, e: Date) => {
    setTempStart(fmtYmd(s));
    setTempEnd(fmtYmd(e));
  };
  const t = parseYmd(today)!;

  const presets: Array<{ label: string; on: () => void }> = [
    { label: "오늘", on: () => setRange(t, t) },
    { label: "전일", on: () => { const y = addDays(t, -1); setRange(y, y); } },
    { label: "주간", on: () => { const m = startOfWeekMon(t); setRange(m, addDays(m, 6)); } },
    { label: "전주", on: () => { const m = addDays(startOfWeekMon(t), -7); setRange(m, addDays(m, 6)); } },
    { label: "당월", on: () => setRange(startOfMonth(t), t) },
    { label: "전월", on: () => {
        const lm = new Date(t.getFullYear(), t.getMonth() - 1, 1);
        setRange(lm, endOfMonth(lm));
      } },
    { label: "오늘까지", on: () => {
        const yStart = new Date(t.getFullYear(), 0, 1);
        setRange(yStart, t);
      } },
  ];

  const quarters = [
    { label: "1분기", from: 0, to: 2 },
    { label: "2분기", from: 3, to: 5 },
    { label: "3분기", from: 6, to: 8 },
    { label: "4분기", from: 9, to: 11 },
  ];

  const halves = [
    { label: "상반기", from: 0, to: 5 },
    { label: "하반기", from: 6, to: 11 },
  ];

  const months = Array.from({ length: 12 }, (_, i) => i);

  // DayPicker selected 변환
  const sel = (() => {
    const from = parseYmd(tempStart) ?? undefined;
    const to = parseYmd(tempEnd) ?? undefined;
    if (!from && !to) return undefined;
    return { from, to };
  })();

  const onApplyClick = () => {
    if (tempStart > tempEnd) {
      // swap
      onApply(tempEnd, tempStart);
    } else {
      onApply(tempStart, tempEnd);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 36,
          padding: "0 12px",
          borderRadius: 6,
          border: "1px solid #cbd5e1",
          background: "#fff",
          color: "#0b2536",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "#64748b" }}>📅</span>
        <span>{start}</span>
        <span style={{ color: "#94a3b8" }}>~</span>
        <span>{end}</span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            boxShadow: "0 16px 40px rgba(2,32,46,0.18)",
            padding: 14,
            minWidth: 600,
          }}
        >
          {/* 상단 입력 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#475569", minWidth: 56 }}>조회기간</span>
            <input
              type="date"
              value={tempStart}
              max={tempEnd || maxYmd}
              onChange={(e) => setTempStart(e.target.value)}
              style={inputStyle}
            />
            <span style={{ color: "#94a3b8", fontWeight: 800 }}>~</span>
            <input
              type="date"
              value={tempEnd}
              min={tempStart}
              max={maxYmd}
              onChange={(e) => setTempEnd(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* 프리셋 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {presets.map((p) => (
                <button key={p.label} type="button" onClick={p.on} style={presetBtn}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {quarters.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    const yr = t.getFullYear();
                    setRange(new Date(yr, q.from, 1), endOfMonth(new Date(yr, q.to, 1)));
                  }}
                  style={presetBtn}
                >
                  {q.label}
                </button>
              ))}
              {halves.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => {
                    const yr = t.getFullYear();
                    setRange(new Date(yr, h.from, 1), endOfMonth(new Date(yr, h.to, 1)));
                  }}
                  style={presetBtn}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const yr = t.getFullYear();
                    const s = new Date(yr, m, 1);
                    setRange(s, endOfMonth(s));
                  }}
                  style={{ ...presetBtn, minWidth: 38, padding: "0 6px" }}
                >
                  {m + 1}월
                </button>
              ))}
            </div>
          </div>

          {/* 두 달 캘린더 */}
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
            <DayPicker
              mode="range"
              selected={sel}
              onSelect={(range) => {
                if (!range) return;
                if (range.from) setTempStart(fmtYmd(range.from));
                if (range.to) setTempEnd(fmtYmd(range.to));
              }}
              numberOfMonths={2}
              locale={ko}
              disabled={maxDate ? { after: maxDate } : undefined}
              weekStartsOn={0}
              showOutsideDays
            />
          </div>

          {/* 푸터 */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
            <button type="button" onClick={onApplyClick} style={primaryBtn}>적용</button>
            <button type="button" onClick={() => setOpen(false)} style={secondaryBtn}>닫기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 13,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "#fff",
  color: "#0b2536",
};

const presetBtn: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#1e3a8a",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryBtn: React.CSSProperties = {
  height: 36,
  padding: "0 22px",
  borderRadius: 6,
  border: "none",
  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  height: 36,
  padding: "0 22px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};
