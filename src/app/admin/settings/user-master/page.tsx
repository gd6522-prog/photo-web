"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  approval_status: string | null;

  name: string | null;
  phone: string | null;
  birthdate: string | null;
  work_part: string | null;

  company_name: string | null;
  work_table: string | null;
  join_date: string | null;
  leave_date: string | null;

  is_admin?: boolean | null;
  created_at?: string | null;
};

const COMPANY_OPTIONS = ["한익스프레스", "경산씨스템", "더블에스잡", "비상GLS"] as const;

const COMPANY_ORDER: Record<string, number> = {
  한익스프레스: 10,
  경산씨스템: 20,
  더블에스잡: 30,
  비상GLS: 40,
};

const WORK_TABLE_OPTIONS = [
  "조출A 06시00분~15시00분",
  "조출B 07시00분~16시00분",
  "사무 08시30분~17시30분",
  "현장A 09시30분~18시30분",
  "현장B 10시30분~19시30분",
] as const;

function kstTodayYMD(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function calcAge(birthYmd: string | null): number | null {
  if (!birthYmd) return null;
  const [by, bm, bd] = birthYmd.split("-").map(Number);
  if (!by || !bm || !bd) return null;

  const [ty, tm, td] = kstTodayYMD().split("-").map(Number);

  let age = ty - by;
  const hasHadBirthday = tm > bm || (tm === bm && td >= bd);
  if (!hasHadBirthday) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

function daysBetweenInclusive(fromYmd: string, toYmd: string): number | null {
  const a = new Date(`${fromYmd}T00:00:00+09:00`).getTime();
  const b = new Date(`${toYmd}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Math.floor((b - a) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

function calcTenureDays(join: string | null, leave: string | null): number | null {
  if (!join) return null;
  const end = leave || kstTodayYMD();
  return daysBetweenInclusive(join, end);
}

function tenurePretty(days: number | null): string {
  if (days == null) return "-";
  const y = Math.floor(days / 365);
  const rem1 = days % 365;
  const m = Math.floor(rem1 / 30);
  const d = rem1 % 30;

  const parts: string[] = [];
  if (y) parts.push(`${y}년`);
  if (m) parts.push(`${m}개월`);
  parts.push(`${d}일`);
  return parts.join(" ");
}

function toKRLocalDigits(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("+82")) {
    const digits = s.replace(/[^\d]/g, "");
    const tail = digits.slice(2);
    return "0" + tail;
  }
  return s.replace(/[^\d]/g, "");
}

function formatKRPhone(raw: string | null): string {
  const digits = toKRLocalDigits(raw ?? "");
  if (!digits) return "-";

  if (digits.startsWith("010") && digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.startsWith("01") && digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.startsWith("02") && (digits.length === 9 || digits.length === 10)) {
    const mid = digits.length === 9 ? 3 : 4;
    return `${digits.slice(0, 2)}-${digits.slice(2, 2 + mid)}-${digits.slice(2 + mid)}`;
  }
  if (digits.length >= 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(digits.length - 4)}`;
  }
  return digits;
}

function workTableShort(v: string | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  return s.split(" ")[0] || "-";
}

function workTableTimeOnly(v: string): string {
  const parts = v.split(" ");
  return parts.slice(1).join(" ").trim() || v;
}

function inputStyle(disabled?: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    background: disabled ? "rgba(0,0,0,0.03)" : "white",
    outline: "none",
  };
}

function buttonStyle(disabled?: boolean, dark?: boolean): React.CSSProperties {
  return {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    background: dark ? "black" : "white",
    color: dark ? "white" : "black",
    fontWeight: 950,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}

type ShiftTodayRow = {
  user_id: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

type TodayShiftMap = Record<string, { inAt: string | null; outAt: string | null }>;

function normalizeApproval(v: string | null): "pending" | "approved" | "rejected" {
  const s = String(v ?? "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

function isWorkingNow(today: { inAt: string | null; outAt: string | null } | undefined): boolean {
  if (!today) return false;
  return !!today.inAt && !today.outAt;
}

export default function UserMasterPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [qName, setQName] = useState("");
  const [qPart, setQPart] = useState("");
  const [qCompany, setQCompany] = useState<string>("");
  const [qWorkTable, setQWorkTable] = useState<string>("");

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  const [todayShiftMap, setTodayShiftMap] = useState<TodayShiftMap>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [bulkCompany, setBulkCompany] = useState<string>("");
  const [bulkWorkTable, setBulkWorkTable] = useState<string>("");

  const [f, setF] = useState({
    name: "",
    phone: "",
    birthdate: "",
    work_part: "",
    company_name: "",
    work_table: "",
    join_date: "",
    leave_date: "",
    is_admin: false,
    is_general_admin: false,
    approval_status: "pending" as "pending" | "approved" | "rejected",
  });

  const age = useMemo(() => calcAge(f.birthdate || null), [f.birthdate]);
  const tenureDays = useMemo(() => calcTenureDays(f.join_date || null, f.leave_date || null), [f.join_date, f.leave_date]);
  const tenureText = useMemo(() => tenurePretty(tenureDays), [tenureDays]);

  const openEdit = (r: ProfileRow) => {
    const general = String(r.work_part ?? "").trim() === "관리자";
    const ap = normalizeApproval(r.approval_status);

    setSelected(r);
    setF({
      name: r.name ?? "",
      phone: toKRLocalDigits(r.phone ?? ""),
      birthdate: r.birthdate ?? "",
      work_part: r.work_part ?? "",
      company_name: r.company_name ?? "",
      work_table: r.work_table ?? "",
      join_date: r.join_date ?? "",
      leave_date: r.leave_date ?? "",
      is_admin: !!r.is_admin,
      is_general_admin: !r.is_admin && general,
      approval_status: ap,
    });
  };

  const closeEdit = () => setSelected(null);

  const sortByCompanyOrder = (list: ProfileRow[]) => {
    return [...list].sort((a, b) => {
      const ao = COMPANY_ORDER[String(a.company_name ?? "").trim()] ?? 9999;
      const bo = COMPANY_ORDER[String(b.company_name ?? "").trim()] ?? 9999;
      if (ao !== bo) return ao - bo;

      const an = String(a.name ?? "").trim();
      const bn = String(b.name ?? "").trim();
      const c1 = an.localeCompare(bn, "ko");
      if (c1 !== 0) return c1;

      return String(a.id).localeCompare(String(b.id));
    });
  };

  const load = async () => {
    setLoading(true);
    setErr(null);

    try {
      let q = supabase
        .from("profiles")
        .select("id,approval_status,name,phone,birthdate,work_part,company_name,work_table,join_date,leave_date,is_admin,created_at");

      const name = qName.trim();
      const part = qPart.trim();
      const company = qCompany.trim();
      const wt = qWorkTable.trim();

      if (name) q = q.ilike("name", `%${name}%`);
      if (part) q = q.eq("work_part", part);
      if (company) q = q.eq("company_name", company);
      if (wt) q = q.eq("work_table", wt);

      const { data, error } = await q;
      if (error) throw error;

      const list = sortByCompanyOrder((data ?? []) as ProfileRow[]);
      setRows(list);

      const ids = list.map((r) => r.id);
      if (ids.length > 0) {
        const today = kstTodayYMD();
        const { data: shifts, error: sErr } = await supabase
          .from("work_shifts")
          .select("user_id, clock_in_at, clock_out_at")
          .eq("work_date", today)
          .in("user_id", ids);

        if (sErr) throw sErr;

        const map: TodayShiftMap = {};
        for (const r of (shifts ?? []) as ShiftTodayRow[]) {
          map[r.user_id] = { inAt: r.clock_in_at, outAt: r.clock_out_at };
        }
        setTodayShiftMap(map);
      } else {
        setTodayShiftMap({});
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "불러오기 실패"));
      setRows([]);
      setTodayShiftMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const partOptions = useMemo(() => uniq(rows.map((r) => String(r.work_part ?? ""))), [rows]);

  const allChecked = useMemo(() => rows.length > 0 && rows.every((r) => selectedIds.has(r.id)), [rows, selectedIds]);

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setErr(null);

    try {
      const phoneDigits = toKRLocalDigits(f.phone);
      const phoneToSave = phoneDigits ? phoneDigits : null;

      const workPartToSave = f.is_general_admin && !f.is_admin ? "관리자" : (f.work_part.trim() || null);

      const payload: any = {
        name: f.name.trim() || null,
        phone: phoneToSave,
        birthdate: f.birthdate || null,
        work_part: workPartToSave,
        company_name: f.company_name.trim() || null,
        work_table: f.work_table.trim() || null,
        join_date: f.join_date || null,
        leave_date: f.leave_date || null,
        is_admin: !!f.is_admin,
        approval_status: f.approval_status || "pending",
      };

      const { error } = await supabase.from("profiles").update(payload).eq("id", selected.id);
      if (error) throw error;

      await load();
      closeEdit();
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "저장 실패"));
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (!bulkCompany.trim() && !bulkWorkTable.trim()) {
      setErr("일괄 적용할 값(회사명 또는 근무테이블)을 선택해 주세요.");
      return;
    }

    setBulkSaving(true);
    setErr(null);

    try {
      const payload: any = {};
      if (bulkCompany.trim()) payload.company_name = bulkCompany.trim();
      if (bulkWorkTable.trim()) payload.work_table = bulkWorkTable.trim();

      const { error } = await supabase.from("profiles").update(payload).in("id", ids);
      if (error) throw error;

      await load();
      clearSelection();
      setBulkCompany("");
      setBulkWorkTable("");
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "일괄 적용 실패"));
    } finally {
      setBulkSaving(false);
    }
  };

  const updateApprovalInline = async (id: string, next: "pending" | "approved" | "rejected") => {
    setErr(null);
    try {
      const { error } = await supabase.from("profiles").update({ approval_status: next }).eq("id", id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "상태 변경 실패"));
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div style={{ padding: 16, maxWidth: 1500, margin: "0 auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 950, margin: 0 }}>사용자 마스터</h1>
        <button onClick={load} disabled={loading} style={buttonStyle(loading)}>
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "white",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 200 }}>
          <span style={{ width: 70, fontSize: 13, opacity: 0.8 }}>이름</span>
          <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="이름 검색" style={inputStyle()} />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 220 }}>
          <span style={{ width: 70, fontSize: 13, opacity: 0.8 }}>작업파트</span>
          <select value={qPart} onChange={(e) => setQPart(e.target.value)} style={inputStyle()}>
            <option value="">전체</option>
            {partOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 260 }}>
          <span style={{ width: 70, fontSize: 13, opacity: 0.8 }}>회사명</span>
          <select value={qCompany} onChange={(e) => setQCompany(e.target.value)} style={inputStyle()}>
            <option value="">전체</option>
            {COMPANY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 330 }}>
          <span style={{ width: 70, fontSize: 13, opacity: 0.8 }}>근무테이블</span>
          <select value={qWorkTable} onChange={(e) => setQWorkTable(e.target.value)} style={inputStyle()}>
            <option value="">전체</option>
            {WORK_TABLE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <button onClick={load} style={buttonStyle(false)}>
          조회
        </button>
      </div>

      {/* Bulk bar */}
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.08)",
          background: selectedCount > 0 ? "#FFF7ED" : "white",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 13 }}>
          선택: <span style={{ fontSize: 14 }}>{selectedCount.toLocaleString()}</span>명
        </div>

        <div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.08)" }} />

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 260 }}>
          <span style={{ width: 70, fontSize: 13, opacity: 0.8 }}>회사명</span>
          <select value={bulkCompany} onChange={(e) => setBulkCompany(e.target.value)} style={inputStyle(selectedCount === 0)}>
            <option value="">(변경안함)</option>
            {COMPANY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 320 }}>
          <span style={{ width: 70, fontSize: 13, opacity: 0.8 }}>근무테이블</span>
          <select value={bulkWorkTable} onChange={(e) => setBulkWorkTable(e.target.value)} style={inputStyle(selectedCount === 0)}>
            <option value="">(변경안함)</option>
            {WORK_TABLE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {workTableTimeOnly(t)}
              </option>
            ))}
          </select>
        </label>

        <button onClick={applyBulk} disabled={bulkSaving || selectedCount === 0} style={buttonStyle(bulkSaving || selectedCount === 0, true)}>
          {bulkSaving ? "일괄 적용 중..." : "일괄 적용"}
        </button>

        <button onClick={clearSelection} disabled={selectedCount === 0} style={buttonStyle(selectedCount === 0)}>
          선택해제
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,0,0,0.06)", border: "1px solid rgba(255,0,0,0.18)", color: "rgba(120,0,0,0.9)", fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* Table */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, background: "white" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, background: "white", padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.08)", width: 44 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              {["이름", "전화번호", "생년월일", "나이", "작업파트", "회사명", "근무테이블", "입사일", "퇴사일", "근속", "상태", "관리"].map((h) => (
                <th key={h} style={{ position: "sticky", top: 0, background: "white", textAlign: "left", fontSize: 12, opacity: 0.85, padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={12} style={{ padding: 16, opacity: 0.7 }}>
                  데이터 없음
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const ageV = calcAge(r.birthdate);
                const tenDays = calcTenureDays(r.join_date, r.leave_date);

                const ap = normalizeApproval(r.approval_status);
                const approved = ap === "approved";
                const working = approved ? isWorkingNow(todayShiftMap[r.id]) : false;

                return (
                  <tr key={r.id}>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                    </td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)", fontWeight: 950 }}>{r.name ?? "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{formatKRPhone(r.phone)}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{r.birthdate ?? "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{ageV == null ? "-" : `${ageV}세`}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{r.work_part ?? "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{r.company_name ?? "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{workTableShort(r.work_table)}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{r.join_date ?? "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{r.leave_date ?? "-"}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{tenurePretty(tenDays)}</td>

                    {/* ✅ 상태: 승인대기/거절/승인(드롭다운) 또는 근무중 / - */}
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      {!approved ? (
                        <select
                          value={ap}
                          onChange={(e) => updateApprovalInline(r.id, e.target.value as any)}
                          style={{
                            height: 34,
                            padding: "0 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.15)",
                            background: ap === "pending" ? "rgba(255,170,0,0.08)" : ap === "rejected" ? "rgba(255,0,0,0.06)" : "white",
                            fontWeight: 950,
                            cursor: "pointer",
                          }}
                          title="상태를 눌러 승인/거절 선택"
                        >
                          <option value="pending">승인대기</option>
                          <option value="approved">승인</option>
                          <option value="rejected">거절</option>
                        </select>
                      ) : working ? (
                        <span style={{ padding: "4px 10px", borderRadius: 999, fontWeight: 950, fontSize: 12, border: "1px solid rgba(255,140,0,0.35)", background: "rgba(255,140,0,0.10)" }}>
                          근무중
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <button onClick={() => openEdit(r)} style={{ height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", fontWeight: 950, cursor: "pointer" }}>
                        수정
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal (그대로 유지) */}
      {selected && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}
        >
          <div style={{ width: "100%", maxWidth: 760, background: "white", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>사용자 수정</div>
              <button onClick={closeEdit} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", opacity: 0.7 }}>
                ✕
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>이름</div>
                  <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} style={inputStyle()} />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>전화번호(010…)</div>
                  <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} style={inputStyle()} placeholder="01099237924" />
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>표시: {formatKRPhone(f.phone)}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>생년월일</div>
                  <input value={f.birthdate} onChange={(e) => setF((p) => ({ ...p, birthdate: e.target.value }))} style={inputStyle()} type="date" />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>작업파트</div>
                  <input value={f.work_part} onChange={(e) => setF((p) => ({ ...p, work_part: e.target.value }))} style={inputStyle()} />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>회사명</div>
                  <select value={f.company_name} onChange={(e) => setF((p) => ({ ...p, company_name: e.target.value }))} style={inputStyle()}>
                    <option value="">-</option>
                    {COMPANY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>근무테이블</div>
                  <select value={f.work_table} onChange={(e) => setF((p) => ({ ...p, work_table: e.target.value }))} style={inputStyle()}>
                    <option value="">-</option>
                    {WORK_TABLE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {workTableTimeOnly(t)}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>표시명: {workTableShort(f.work_table)}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>입사일</div>
                  <input value={f.join_date} onChange={(e) => setF((p) => ({ ...p, join_date: e.target.value }))} style={inputStyle()} type="date" />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>퇴사일</div>
                  <input value={f.leave_date} onChange={(e) => setF((p) => ({ ...p, leave_date: e.target.value }))} style={inputStyle()} type="date" />
                </div>

                <div style={{ gridColumn: "1 / -1", paddingTop: 6 }}>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                    <div>
                      나이: <b>{age == null ? "-" : `${age}세`}</b>
                    </div>
                    <div>
                      근속: <b>{tenureText}</b>
                    </div>
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ fontWeight: 950, fontSize: 13, marginBottom: 8 }}>가입 승인</div>
                  <select value={f.approval_status} onChange={(e) => setF((p) => ({ ...p, approval_status: e.target.value as any }))} style={inputStyle()}>
                    <option value="pending">승인대기</option>
                    <option value="approved">승인</option>
                    <option value="rejected">거절</option>
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ fontWeight: 950, fontSize: 13, marginBottom: 8 }}>관리자 권한(선택)</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={f.is_admin}
                        onChange={(e) => setF((p) => ({ ...p, is_admin: e.target.checked, is_general_admin: e.target.checked ? false : p.is_general_admin }))}
                      />
                      <span style={{ fontSize: 13 }}>메인관리자(is_admin)</span>
                    </label>

                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={f.is_general_admin}
                        onChange={(e) => setF((p) => ({ ...p, is_general_admin: e.target.checked, is_admin: e.target.checked ? false : p.is_admin }))}
                      />
                      <span style={{ fontSize: 13 }}>일반관리자(작업파트=관리자)</span>
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={closeEdit} style={buttonStyle(false)}>
                  취소
                </button>

                <button onClick={save} disabled={saving} style={buttonStyle(saving, true)}>
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                * 승인된 사용자 상태는 근무중 / - 로만 표시됩니다.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}