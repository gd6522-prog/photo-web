"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = {
  vNo: string;
  vType: string; // sregist 가 인식한 분류 (등록차량/영업차량/배송차량 등)
  inTime: string;
  outTime: string; // 빈 문자열 = 미출차
  dridoType: "regular" | "visitor" | null;
  visitPurpose: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const th: React.CSSProperties = {
  padding: "10px 8px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 13,
  color: "#0b2536",
  whiteSpace: "nowrap",
};

export default function ParkingIoHistoryPage() {
  const today = useMemo(() => todayKST(), []);
  const [startDate, setStartDate] = useState(() => addDaysYMD(todayKST(), -6));
  const [endDate, setEndDate] = useState(() => todayKST());
  const [vehicle, setVehicle] = useState("");
  const [vehicleInput, setVehicleInput] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Item[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setErrMsg("세션이 없습니다. 다시 로그인해 주세요.");
        return;
      }
      const url = new URL("/api/admin/parking/inout-history", window.location.origin);
      url.searchParams.set("startdate", startDate);
      url.searchParams.set("enddate", endDate);
      if (vehicle) url.searchParams.set("vehicle", vehicle);
      url.searchParams.set("page", String(page));

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        items?: Item[];
        totalPages?: number;
        totalCount?: number;
      };
      if (!res.ok || data.ok === false) {
        setErrMsg(data.message || `HTTP ${res.status}`);
        setItems([]);
        setTotalPages(0);
        setTotalCount(0);
        return;
      }
      setItems(data.items ?? []);
      setTotalPages(data.totalPages ?? 0);
      setTotalCount(data.totalCount ?? 0);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, vehicle, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setVehicle(vehicleInput.trim());
    setPage(1);
  };
  const onResetSearch = () => {
    setVehicle("");
    setVehicleInput("");
    setPage(1);
  };

  return (
    <div style={{ padding: "8px 0", maxWidth: 1700, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0b2536", margin: 0 }}>입출차 내역</h1>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
          총 {totalCount.toLocaleString()}대 / {totalPages.toLocaleString()}페이지
        </div>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          style={{ height: 36, padding: "0 10px", fontSize: 13 }}
        />
        <span style={{ color: "#64748b", fontWeight: 700 }}>~</span>
        <input
          type="date"
          value={endDate}
          min={startDate}
          max={today}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          style={{ height: 36, padding: "0 10px", fontSize: 13 }}
        />

        <div style={{ flex: 1 }} />

        <form onSubmit={onSearch} style={{ display: "flex", gap: 6 }}>
          <input
            value={vehicleInput}
            onChange={(e) => setVehicleInput(e.target.value)}
            placeholder="차량번호 일부 (예: 12가)"
            style={{ height: 36, width: 220, padding: "0 12px", fontSize: 13 }}
          />
          <button
            type="submit"
            style={{
              height: 36, padding: "0 14px", borderRadius: 6, border: "none",
              background: "#0b2536", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}
          >
            검색
          </button>
          {vehicle ? (
            <button
              type="button"
              onClick={onResetSearch}
              style={{
                height: 36, padding: "0 12px", borderRadius: 6, border: "1px solid #cbd5e1",
                background: "#fff", color: "#334155", fontWeight: 800, fontSize: 13, cursor: "pointer",
              }}
            >
              초기화
            </button>
          ) : null}
        </form>
      </div>

      {errMsg ? (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          {errMsg}
        </div>
      ) : null}

      {/* 테이블 */}
      <div className="ha-card" style={{ overflow: "auto", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#f1f5f9", color: "#334155" }}>
              <th style={th}>구분</th>
              <th style={th}>차량번호</th>
              <th style={th}>입차일시</th>
              <th style={th}>출차일시</th>
              <th style={th}>방문목적</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: "30px 12px", textAlign: "center", color: "#64748b" }}>
                  불러오는 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "30px 12px", textAlign: "center", color: "#64748b" }}>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((r, idx) => {
                // 구분 배지: Drido 매칭이 있으면 정기/방문, 없으면 sregist 분류 (영업/배송 등)
                let badgeLabel: string;
                let badgeBg: string;
                let badgeFg: string;
                let badgeBd: string;
                if (r.dridoType === "regular") {
                  badgeLabel = "정기";
                  badgeBg = "#ccfbf1"; badgeFg = "#115e59"; badgeBd = "#99f6e4";
                } else if (r.dridoType === "visitor") {
                  badgeLabel = "방문";
                  badgeBg = "#dbeafe"; badgeFg = "#1e40af"; badgeBd = "#bfdbfe";
                } else {
                  badgeLabel = r.vType || "-";
                  badgeBg = "#f1f5f9"; badgeFg = "#475569"; badgeBd = "#cbd5e1";
                }
                return (
                  <tr key={`${r.vNo}-${r.inTime}-${idx}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={td}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: badgeBg, color: badgeFg, border: `1px solid ${badgeBd}`, fontWeight: 800, fontSize: 11 }}>
                        {badgeLabel}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 800 }}>{r.vNo || "-"}</td>
                    <td style={td}>{r.inTime || "-"}</td>
                    <td style={{ ...td, color: r.outTime ? "#0b2536" : "#94a3b8" }}>
                      {r.outTime || "(미출차)"}
                    </td>
                    <td style={{ ...td, maxWidth: 300, color: "#475569" }}>
                      <div title={r.visitPurpose ?? ""} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.visitPurpose || "-"}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={pageBtn(page <= 1)}>◀</button>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#334155", padding: "0 8px" }}>
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={pageBtn(page >= totalPages)}>▶</button>
        </div>
      ) : null}
    </div>
  );
}

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  width: 36,
  height: 32,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: disabled ? "#cbd5e1" : "#334155",
  fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer",
});
