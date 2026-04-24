"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CarRefTimes = Record<string, { hour: number; minute: number }>;

type ProfileRow = {
  name: string | null;
  approval_status: string | null;
  car_no: string | null;
  car_no_2?: string | null;
  car_no_3?: string | null;
  car_no_4?: string | null;
};

type CarEntry = { carNo: string; driverName: string };

type CompletionRow = {
  work_date: string;
  completed_at: string | null;
  snapshot: Record<string, unknown> | null;
};

const LC_TP_NAMES: Record<string, string> = {
  "01": "박스수기", "02": "소분", "03": "행사존A", "04": "유가증권",
  "05": "담배존",  "06": "이형존A", "08": "주류존", "12": "소분음료",
  "13": "슬라존", "15": "경량존", "17": "이너존", "20": "담배수기",
  "21": "박스존", "25": "이형존B", "48": "공병존",
};

function extractCarEntries(rows: ProfileRow[]): CarEntry[] {
  const map = new Map<string, string>(); // carNo → driverName
  for (const row of rows) {
    const allNos = [row.car_no, row.car_no_2, row.car_no_3, row.car_no_4]
      .flatMap((n) => String(n ?? "").split(","))
      .map((n) => n.replace(/[^\d]/g, "").trim())
      .filter(Boolean);
    for (const n of allNos) {
      if (!map.has(n)) map.set(n, row.name ?? "");
    }
  }
  return Array.from(map.entries())
    .map(([carNo, driverName]) => ({ carNo, driverName }))
    .sort((a, b) => Number(a.carNo) - Number(b.carNo));
}

function fmtDateKo(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${dateStr.replace(/-/g, ".")}(${dow})`;
}

function fmtTimeKst(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #bdd0de",
  borderRadius: 0,
  background: "#fff",
  overflow: "hidden",
  boxShadow: "0 16px 34px rgba(2,32,46,0.10)",
  marginBottom: 18,
};
const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #d9e6ef",
  background: "#f5f8fb",
  fontSize: 14,
  fontWeight: 950,
  color: "#103b53",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export default function WorkCompletionTimePage() {
  const [carEntries, setCarEntries] = useState<CarEntry[]>([]);
  const [carRefTimes, setCarRefTimes] = useState<CarRefTimes>({});
  const [editTimes, setEditTimes] = useState<CarRefTimes>({});
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadDrivers = useCallback(async () => {
    try {
      setLoadingDrivers(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("name,approval_status,car_no,car_no_2,car_no_3,car_no_4")
        .ilike("work_part", "%기사%")
        .eq("approval_status", "approved");
      if (error) throw error;
      const entries = extractCarEntries((data ?? []) as ProfileRow[]);
      setCarEntries(entries);
    } catch { /* ignore */ }
    finally { setLoadingDrivers(false); }
  }, []);

  const loadRefTimes = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/app-settings?key=dps_car_reference_times", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { ok: boolean; value?: CarRefTimes };
      if (j.ok && j.value) {
        setCarRefTimes(j.value);
        setEditTimes(j.value);
      }
    } catch { /* ignore */ }
  }, [getToken]);

  const loadRows = useCallback(async () => {
    try {
      setLoadingRows(true);
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/dps-completion?limit=60", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { ok: boolean; rows?: CompletionRow[] };
      if (j.ok) setRows(j.rows ?? []);
    } catch { /* ignore */ }
    finally { setLoadingRows(false); }
  }, [getToken]);

  useEffect(() => {
    void loadDrivers();
    void loadRefTimes();
    void loadRows();
  }, [loadDrivers, loadRefTimes, loadRows]);

  // 드라이버 로드 후 editTimes에 없는 호차는 기본값으로 채우기
  useEffect(() => {
    if (carEntries.length === 0) return;
    setEditTimes((prev) => {
      const next = { ...prev };
      for (const { carNo } of carEntries) {
        if (!next[carNo]) next[carNo] = { hour: 14, minute: 0 };
      }
      return next;
    });
  }, [carEntries]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인 세션이 없습니다.");
      const res = await fetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "dps_car_reference_times", value: editTimes }),
      });
      const j = await res.json() as { ok: boolean; message?: string };
      if (!j.ok) throw new Error(j.message ?? "저장 실패");
      setCarRefTimes(editTimes);
      setSaveMsg("저장되었습니다.");
    } catch (e: unknown) {
      setSaveMsg((e as Error)?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const setHour = (carNo: string, val: number) =>
    setEditTimes((prev) => ({ ...prev, [carNo]: { ...prev[carNo], hour: Math.min(23, Math.max(0, val)) } }));
  const setMin = (carNo: string, val: number) =>
    setEditTimes((prev) => ({ ...prev, [carNo]: { ...prev[carNo], minute: Math.min(59, Math.max(0, val)) } }));

  const changed = JSON.stringify(editTimes) !== JSON.stringify(carRefTimes);

  return (
    <div>
      {/* 호차별 기준시간 설정 */}
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span>호차별 작업 완료 기준시간 설정</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.includes("되었") ? "#16A34A" : "#EF4444", fontWeight: 700 }}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !changed}
              style={{
                height: 32, padding: "0 18px", borderRadius: 4,
                border: "none",
                background: saving || !changed ? "#e5edf3" : "#0f2940",
                color: saving || !changed ? "#90a4b4" : "#fff",
                fontWeight: 700, fontSize: 13,
                cursor: saving || !changed ? "default" : "pointer",
              }}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
        <div style={{ padding: "10px 16px 6px", fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
          기준시간 대비 현재시각에 따라 메인화면 게이지바 색상이 바뀝니다.&nbsp;
          <span style={{ color: "#2563EB", fontWeight: 700 }}>파란색</span> 11분 이상 여유&nbsp;·&nbsp;
          <span style={{ color: "#F59E0B", fontWeight: 700 }}>주황색</span> 10분 이내&nbsp;·&nbsp;
          <span style={{ color: "#EF4444", fontWeight: 700 }}>빨간색</span> 초과
        </div>
        {loadingDrivers ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>로딩 중...</div>
        ) : carEntries.length === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
            승인된 기사가 없습니다.<br />
            <span style={{ fontSize: 11, color: "#b0bec5" }}>기사 사용자마스터에서 승인된 기사의 호차 정보가 표시됩니다.</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f5f8fb", borderBottom: "2px solid #d9e6ef" }}>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 900, color: "#103b53", width: 80 }}>호차</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 900, color: "#103b53" }}>기사</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 900, color: "#103b53" }}>기준시간</th>
              </tr>
            </thead>
            <tbody>
              {carEntries.map(({ carNo, driverName }, idx) => {
                const t = editTimes[carNo] ?? { hour: 14, minute: 0 };
                return (
                  <tr key={carNo} style={{ borderBottom: "1px solid #e8f0f7", background: idx % 2 === 0 ? "#fff" : "#f9fbfd" }}>
                    <td style={{ padding: "8px 16px", textAlign: "center", fontWeight: 900, color: "#103b53", fontSize: 15 }}>
                      {carNo}호차
                    </td>
                    <td style={{ padding: "8px 16px", color: "#475569", fontWeight: 600 }}>
                      {driverName || "-"}
                    </td>
                    <td style={{ padding: "8px 16px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={t.hour}
                          onChange={(e) => setHour(carNo, Number(e.target.value))}
                          style={{
                            width: 52, padding: "5px 6px", border: "1px solid #b9cddd", borderRadius: 4,
                            fontSize: 15, fontWeight: 700, textAlign: "center", color: "#103b53",
                          }}
                        />
                        <span style={{ fontSize: 16, fontWeight: 900, color: "#103b53" }}>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={t.minute}
                          onChange={(e) => setMin(carNo, Number(e.target.value))}
                          style={{
                            width: 52, padding: "5px 6px", border: "1px solid #b9cddd", borderRadius: 4,
                            fontSize: 15, fontWeight: 700, textAlign: "center", color: "#103b53",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 작업완료 이력 */}
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span>작업 완료 이력 (최근 60일)</span>
          <button
            onClick={() => void loadRows()}
            style={{
              height: 28, padding: "0 12px", borderRadius: 4,
              border: "1px solid #b9cddd", background: "#fff",
              color: "#103b53", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}
          >
            새로고침
          </button>
        </div>
        {loadingRows ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>로딩 중...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
            저장된 이력이 없습니다.<br />
            <span style={{ fontSize: 11, color: "#b0bec5" }}>메인화면에서 모든 파트 작업이 100% 완료되면 자동으로 기록됩니다.</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f5f8fb", borderBottom: "2px solid #d9e6ef" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap" }}>날짜</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap" }}>완료시간</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 900, color: "#103b53", whiteSpace: "nowrap" }}>전체 처리</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 900, color: "#103b53" }}>파트별 현황</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const snap = row.snapshot as { dsTotal?: number; loadedCount?: number; zones?: Record<string, { done: number; total: number }> } | null;
                const zones = snap?.zones ?? {};
                const zoneSummary = Object.entries(zones)
                  .filter(([, z]) => z.total > 0)
                  .map(([code, z]) => `${LC_TP_NAMES[code] ?? code} ${z.done}/${z.total}`)
                  .join(", ");
                return (
                  <tr key={row.work_date} style={{ borderBottom: "1px solid #e8f0f7", background: idx % 2 === 0 ? "#fff" : "#f9fbfd" }}>
                    <td style={{ padding: "10px 16px", fontWeight: 700, color: "#103b53", whiteSpace: "nowrap" }}>
                      {fmtDateKo(row.work_date)}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 900, color: "#0f2940", whiteSpace: "nowrap" }}>
                      {fmtTimeKst(row.completed_at)}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>
                      {snap?.loadedCount != null && snap?.dsTotal != null
                        ? `${snap.loadedCount.toLocaleString("ko-KR")} / ${snap.dsTotal.toLocaleString("ko-KR")}`
                        : "-"}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>
                      {zoneSummary || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
