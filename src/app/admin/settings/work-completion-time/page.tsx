"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RefTime = { hour: number; minute: number };

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

export default function WorkCompletionTimePage() {
  const [refTime, setRefTime] = useState<RefTime>({ hour: 14, minute: 0 });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadRefTime = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/app-settings?key=dps_reference_time", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json() as { ok: boolean; value?: RefTime };
      if (j.ok && j.value?.hour != null) setRefTime(j.value);
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
    void loadRefTime();
    void loadRows();
  }, [loadRefTime, loadRows]);

  const handleSaveRefTime = async () => {
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인 세션이 없습니다.");
      const res = await fetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "dps_reference_time", value: refTime }),
      });
      const j = await res.json() as { ok: boolean; message?: string };
      if (!j.ok) throw new Error(j.message ?? "저장 실패");
      setSaveMsg("저장되었습니다.");
    } catch (e: unknown) {
      setSaveMsg((e as Error)?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

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
  };

  const bodyStyle: React.CSSProperties = {
    padding: "18px 16px",
  };

  return (
    <div>
      {/* 기준시간 설정 */}
      <div style={cardStyle}>
        <div style={headerStyle}>작업 완료 기준시간 설정</div>
        <div style={bodyStyle}>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#475569" }}>
            설정한 기준시간을 기준으로 메인화면의 작업파트별 진행현황 게이지바 색상이 변경됩니다.
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
            • 기준시간보다 11분 이상 여유 → <span style={{ color: "#2563EB", fontWeight: 700 }}>파란색</span><br />
            • 기준시간 10분 이내 → <span style={{ color: "#F59E0B", fontWeight: 700 }}>주황색</span><br />
            • 기준시간 초과 → <span style={{ color: "#EF4444", fontWeight: 700 }}>빨간색</span>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#103b53", whiteSpace: "nowrap" }}>기준시간</label>
            <input
              type="number"
              min={0}
              max={23}
              value={refTime.hour}
              onChange={(e) => setRefTime((prev) => ({ ...prev, hour: Math.min(23, Math.max(0, Number(e.target.value))) }))}
              style={{
                width: 60, padding: "6px 8px", border: "1px solid #b9cddd", borderRadius: 4,
                fontSize: 16, fontWeight: 700, textAlign: "center", color: "#103b53",
              }}
            />
            <span style={{ fontSize: 18, fontWeight: 700, color: "#103b53" }}>:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={refTime.minute}
              onChange={(e) => setRefTime((prev) => ({ ...prev, minute: Math.min(59, Math.max(0, Number(e.target.value))) }))}
              style={{
                width: 60, padding: "6px 8px", border: "1px solid #b9cddd", borderRadius: 4,
                fontSize: 16, fontWeight: 700, textAlign: "center", color: "#103b53",
              }}
            />
            <button
              onClick={handleSaveRefTime}
              disabled={saving}
              style={{
                height: 34, padding: "0 16px", borderRadius: 4,
                border: "none",
                background: saving ? "#e5edf3" : "#0f2940",
                color: saving ? "#90a4b4" : "#fff",
                fontWeight: 700, fontSize: 13,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.includes("되었") ? "#16A34A" : "#EF4444", fontWeight: 700 }}>
                {saveMsg}
              </span>
            )}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "#94a3b8" }}>
            현재 설정: {String(refTime.hour).padStart(2, "0")}:{String(refTime.minute).padStart(2, "0")}
          </p>
        </div>
      </div>

      {/* 작업완료 이력 */}
      <div style={cardStyle}>
        <div style={{ ...headerStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
        <div style={{ padding: 0 }}>
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
                    <tr
                      key={row.work_date}
                      style={{
                        borderBottom: "1px solid #e8f0f7",
                        background: idx % 2 === 0 ? "#fff" : "#f9fbfd",
                      }}
                    >
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
    </div>
  );
}
