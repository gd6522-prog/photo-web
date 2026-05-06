"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ParkingRow = {
  id: string;
  type: "regular" | "visitor";
  company: string;
  name: string;
  car_number: string;
  phone: string;
  visit_date: string | null;
  visit_purpose: string | null;
  expire_date: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  reject_reason: string | null;
  admin_memo: string | null;
  created_at: string;
  sregist_registered: boolean | null;
  sregist_registered_at: string | null;
  sregist_response: string | null;
};

type SregistHealth = { autoRegisterEnabled: boolean; reachable: boolean; message?: string } | null;

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "expired";

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<ParkingRow["status"], string> = {
  pending: "대기중",
  approved: "승인",
  rejected: "거절",
  expired: "만료",
};

const STATUS_COLORS: Record<ParkingRow["status"], { bg: string; fg: string; bd: string }> = {
  pending: { bg: "#fef3c7", fg: "#92400e", bd: "#fde68a" },
  approved: { bg: "#dcfce7", fg: "#166534", bd: "#bbf7d0" },
  rejected: { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" },
  expired: { bg: "#e2e8f0", fg: "#475569", bd: "#cbd5e1" },
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())} ${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  height: 36,
  padding: "0 16px",
  borderRadius: 8,
  border: active ? "none" : "1px solid #cbd5e1",
  background: active ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)" : "#ffffff",
  color: active ? "#ffffff" : "#334155",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const actionBtn = (variant: "approve" | "reject" | "memo" | "retry" | "delete"): React.CSSProperties => ({
  height: 28,
  padding: "0 10px",
  borderRadius: 6,
  border: "none",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  color: "#ffffff",
  background:
    variant === "approve"
      ? "linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)"
      : variant === "reject"
      ? "linear-gradient(135deg,#b91c1c 0%,#ef4444 100%)"
      : variant === "retry"
      ? "linear-gradient(135deg,#b45309 0%,#f59e0b 100%)"
      : variant === "delete"
      ? "linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%)"
      : "linear-gradient(135deg,#475569 0%,#64748b 100%)",
});

const statCard: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  background: "#ffffff",
  border: "1px solid #bcd0de",
  borderRadius: 8,
  padding: "14px 16px",
  boxShadow: "0 4px 14px rgba(2,32,46,0.06)",
};

export default function AdminParkingPage() {
  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({ todayNew: 0, pending: 0, expiringToday: 0 });

  const [rejectTarget, setRejectTarget] = useState<ParkingRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [memoTarget, setMemoTarget] = useState<ParkingRow | null>(null);
  const [memoText, setMemoText] = useState("");

  const [sregistHealth, setSregistHealth] = useState<SregistHealth>(null);

  const today = useMemo(() => todayKST(), []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("parking_requests")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      if (search.trim()) {
        const s = search.trim().replace(/[%,]/g, "");
        q = q.or(`car_number.ilike.%${s}%,name.ilike.%${s}%,company.ilike.%${s}%`);
      }

      const { data, count, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as ParkingRow[]);
      setTotal(count ?? 0);
    } catch (e) {
      console.error("[admin/parking] load failed", e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  const loadStats = useCallback(async () => {
    try {
      const todayStartIso = new Date(`${today}T00:00:00+09:00`).toISOString();
      const todayEndIso = new Date(`${today}T23:59:59+09:00`).toISOString();

      const [newRes, pendingRes, expRes] = await Promise.all([
        supabase
          .from("parking_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStartIso)
          .lte("created_at", todayEndIso),
        supabase
          .from("parking_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("parking_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .eq("expire_date", today),
      ]);

      setStats({
        todayNew: newRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        expiringToday: expRes.count ?? 0,
      });
    } catch (e) {
      console.error("[admin/parking] stats failed", e);
    }
  }, [today]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/admin/sregist-status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!alive) return;
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          autoRegisterEnabled?: boolean;
          reachable?: boolean;
          message?: string;
        };
        if (data.ok === false) return;
        setSregistHealth({
          autoRegisterEnabled: !!data.autoRegisterEnabled,
          reachable: !!data.reachable,
          message: data.message,
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const callAdminApi = async (
    path: string,
    init: RequestInit = {}
  ): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return { ok: false, message: "세션이 없습니다. 다시 로그인해 주세요." };
    const res = await fetch(path, {
      method: "POST",
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return { ok: false, message: typeof data.message === "string" ? data.message : `HTTP ${res.status}` };
    }
    return { ok: true, data };
  };

  const onApprove = async (row: ParkingRow) => {
    if (!confirm(`승인하시겠습니까?\n${row.company} / ${row.name} / ${row.car_number}`)) return;

    const r = await callAdminApi(`/api/admin/parking/${row.id}/approve`);
    if (!r.ok) {
      alert(`승인 실패: ${r.message}`);
      return;
    }

    if (r.data?.sregistAttempted === true && r.data?.sregistRegistered === false) {
      alert(
        `승인은 처리됐지만 주차관제 자동등록은 실패했습니다.\n사유: ${
          (r.data?.sregistError as string) ?? "알 수 없음"
        }\n\n[재등록] 버튼으로 다시 시도할 수 있습니다.`
      );
    }

    await Promise.all([loadRows(), loadStats()]);
  };

  const onSregistRetry = async (row: ParkingRow) => {
    if (!confirm(`주차관제에 재등록하시겠습니까?\n${row.company} / ${row.name} / ${row.car_number}`)) return;
    const r = await callAdminApi(`/api/admin/parking/${row.id}/sregist-retry`);
    if (!r.ok) {
      alert(`재등록 실패: ${r.message}`);
      return;
    }
    if (r.data?.sregistRegistered === false) {
      alert(`재등록 실패: ${(r.data?.sregistError as string) ?? "알 수 없음"}`);
    }
    await loadRows();
  };

  const onDelete = async (row: ParkingRow) => {
    if (
      !confirm(
        `이 신청을 완전 삭제하시겠습니까?\n${row.company} / ${row.name} / ${row.car_number}\n\n` +
          `Drido DB 에서 영구 삭제되며, 주차관제(sregist)에 등록돼 있다면 함께 삭제 시도합니다.\n복구할 수 없습니다.`
      )
    )
      return;

    const r = await callAdminApi(`/api/admin/parking/${row.id}/delete`);
    if (!r.ok) {
      alert(`삭제 실패: ${r.message}`);
      return;
    }
    if (r.data?.sregistError) {
      alert(
        `Drido DB 에선 삭제됐지만 주차관제 측 삭제는 실패했습니다.\n사유: ${r.data.sregistError}\n\n` +
          `주차관제에 차량이 남아있을 수 있으니 직접 확인해 주세요.`
      );
    }
    await Promise.all([loadRows(), loadStats()]);
  };

  const onSubmitReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      alert("거절 사유를 입력해 주세요.");
      return;
    }
    const r = await callAdminApi(`/api/admin/parking/${rejectTarget.id}/reject`, {
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    if (!r.ok) {
      alert(`거절 실패: ${r.message}`);
      return;
    }
    setRejectTarget(null);
    setRejectReason("");
    await Promise.all([loadRows(), loadStats()]);
  };

  const onSubmitMemo = async () => {
    if (!memoTarget) return;
    const { error } = await supabase
      .from("parking_requests")
      .update({ admin_memo: memoText.trim() || null })
      .eq("id", memoTarget.id);
    if (error) {
      alert(`메모 저장 실패: ${error.message}`);
      return;
    }
    setMemoTarget(null);
    setMemoText("");
    await loadRows();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: "8px 0", maxWidth: 1700, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0b2536", margin: 0 }}>주차 신청 관리</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sregistHealth ? (
            <span
              title={sregistHealth.message ?? ""}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
                background: !sregistHealth.autoRegisterEnabled
                  ? "#e2e8f0"
                  : sregistHealth.reachable
                  ? "#dcfce7"
                  : "#fee2e2",
                color: !sregistHealth.autoRegisterEnabled
                  ? "#475569"
                  : sregistHealth.reachable
                  ? "#166534"
                  : "#991b1b",
                border: "1px solid",
                borderColor: !sregistHealth.autoRegisterEnabled
                  ? "#cbd5e1"
                  : sregistHealth.reachable
                  ? "#bbf7d0"
                  : "#fecaca",
              }}
            >
              주차관제 연결:{" "}
              {!sregistHealth.autoRegisterEnabled
                ? "자동등록 OFF"
                : sregistHealth.reachable
                ? "정상"
                : "오류"}
            </span>
          ) : null}
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>총 {total.toLocaleString()}건</div>
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={statCard}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>오늘 신규신청</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f766e", marginTop: 4 }}>{stats.todayNew}건</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>대기중</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#b45309", marginTop: 4 }}>{stats.pending}건</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>오늘 만료</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#475569", marginTop: 4 }}>{stats.expiringToday}건</div>
        </div>
      </div>

      {/* 필터/검색 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            ["all", "전체"],
            ["pending", "대기중"],
            ["approved", "승인"],
            ["rejected", "거절"],
            ["expired", "만료"],
          ] as Array<[StatusFilter, string]>).map(([key, label]) => (
            <button
              key={key}
              style={tabBtn(statusFilter === key)}
              onClick={() => {
                setStatusFilter(key);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
          style={{ display: "flex", gap: 6 }}
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="차량번호, 이름, 회사명"
            style={{ height: 36, width: 240, padding: "0 12px", fontSize: 13 }}
          />
          <button
            type="submit"
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              border: "none",
              background: "#0b2536",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            검색
          </button>
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchInput("");
                setPage(1);
              }}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              초기화
            </button>
          ) : null}
        </form>
      </div>

      {/* 테이블 */}
      <div className="ha-card" style={{ overflow: "auto", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1100 }}>
          <thead>
            <tr style={{ background: "#f1f5f9", color: "#334155" }}>
              <th style={th}>신청일시</th>
              <th style={th}>구분</th>
              <th style={th}>회사</th>
              <th style={th}>이름</th>
              <th style={th}>차량번호</th>
              <th style={th}>연락처</th>
              <th style={th}>방문일</th>
              <th style={th}>만료일</th>
              <th style={th}>상태</th>
              <th style={th}>메모</th>
              <th style={{ ...th, textAlign: "right", paddingRight: 12 }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ padding: "30px 12px", textAlign: "center", color: "#64748b" }}>
                  불러오는 중...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: "30px 12px", textAlign: "center", color: "#64748b" }}>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const c = STATUS_COLORS[r.status];
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={td}>{fmtDateTime(r.created_at)}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: r.type === "regular" ? "#ccfbf1" : "#dbeafe",
                          color: r.type === "regular" ? "#115e59" : "#1e40af",
                          fontWeight: 800,
                          fontSize: 11,
                        }}
                      >
                        {r.type === "regular" ? "정기" : "방문"}
                      </span>
                    </td>
                    <td style={td}>{r.company}</td>
                    <td style={td}>{r.name}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{r.car_number}</td>
                    <td style={td}>{r.phone}</td>
                    <td style={td}>{r.visit_date ?? "-"}</td>
                    <td style={td}>{r.expire_date ?? "-"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: c.bg,
                            color: c.fg,
                            border: `1px solid ${c.bd}`,
                            fontWeight: 800,
                            fontSize: 11,
                          }}
                          title={r.status === "rejected" && r.reject_reason ? `사유: ${r.reject_reason}` : undefined}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                        {r.status === "approved" && r.sregist_response && !r.sregist_registered ? (
                          <span
                            title={r.sregist_response ?? ""}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "#fef2f2",
                              color: "#b91c1c",
                              border: "1px solid #fecaca",
                              fontWeight: 800,
                              fontSize: 10,
                              whiteSpace: "nowrap",
                            }}
                          >
                            주차관제 등록실패
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ ...td, maxWidth: 200, color: "#475569" }}>
                      {r.type === "visitor" ? (
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={r.visit_purpose ?? ""}
                        >
                          {r.visit_purpose || "-"}
                        </div>
                      ) : (
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={r.admin_memo ?? ""}
                        >
                          {r.admin_memo || "-"}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", paddingRight: 12 }}>
                      <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {r.status === "pending" ? (
                          <>
                            <button style={actionBtn("approve")} onClick={() => onApprove(r)}>
                              승인
                            </button>
                            <button
                              style={actionBtn("reject")}
                              onClick={() => {
                                setRejectTarget(r);
                                setRejectReason("");
                              }}
                            >
                              거절
                            </button>
                          </>
                        ) : null}
                        {r.status === "approved" && r.sregist_response && !r.sregist_registered ? (
                          <button style={actionBtn("retry")} onClick={() => onSregistRetry(r)} title="주차관제에 다시 등록 시도">
                            재등록
                          </button>
                        ) : null}
                        {r.type === "regular" ? (
                          <button
                            style={actionBtn("memo")}
                            onClick={() => {
                              setMemoTarget(r);
                              setMemoText(r.admin_memo ?? "");
                            }}
                          >
                            메모
                          </button>
                        ) : null}
                        <button
                          style={actionBtn("delete")}
                          onClick={() => onDelete(r)}
                          title="Drido DB + 주차관제 시스템에서 모두 삭제"
                        >
                          삭제
                        </button>
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
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={pageBtn(page <= 1)}
          >
            ◀
          </button>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#334155", padding: "0 8px" }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={pageBtn(page >= totalPages)}
          >
            ▶
          </button>
        </div>
      ) : null}

      {/* 거절 모달 */}
      {rejectTarget ? (
        <Modal onClose={() => setRejectTarget(null)} title="신청 거절">
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
            {rejectTarget.company} / {rejectTarget.name} / {rejectTarget.car_number}
          </div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#334155", marginBottom: 6 }}>
            거절 사유 *
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="신청자에게 안내될 사유를 입력해 주세요."
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, resize: "vertical" }}
            maxLength={300}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button onClick={() => setRejectTarget(null)} style={modalBtn("ghost")}>
              취소
            </button>
            <button onClick={onSubmitReject} style={modalBtn("danger")}>
              거절하기
            </button>
          </div>
        </Modal>
      ) : null}

      {/* 메모 모달 */}
      {memoTarget ? (
        <Modal onClose={() => setMemoTarget(null)} title="관리자 메모">
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
            {memoTarget.company} / {memoTarget.name} / {memoTarget.car_number}
          </div>
          <textarea
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            rows={4}
            placeholder="내부 메모 (신청자에게 노출되지 않습니다)"
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, resize: "vertical" }}
            maxLength={500}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button onClick={() => setMemoTarget(null)} style={modalBtn("ghost")}>
              취소
            </button>
            <button onClick={onSubmitMemo} style={modalBtn("primary")}>
              저장
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
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

const modalBtn = (variant: "ghost" | "primary" | "danger"): React.CSSProperties => ({
  height: 38,
  padding: "0 16px",
  borderRadius: 6,
  border: variant === "ghost" ? "1px solid #cbd5e1" : "none",
  background:
    variant === "ghost"
      ? "#ffffff"
      : variant === "primary"
      ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)"
      : "linear-gradient(135deg,#b91c1c 0%,#ef4444 100%)",
  color: variant === "ghost" ? "#334155" : "#ffffff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
});

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#ffffff",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 24px 60px rgba(2,32,46,0.25)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, color: "#0b2536", marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}
