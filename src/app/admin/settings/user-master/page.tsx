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
  center: string | null;
  company_name: string | null;
  work_table: string | null;
  join_date: string | null;
  leave_date: string | null;
  nationality: string | null;
  visa: string | null;
  is_admin?: boolean | null;
  is_general_admin?: boolean | null;
  is_center_admin?: boolean | null;
  is_company_admin?: boolean | null;
};

type TodayShiftMap = Record<string, { inAt: string | null; outAt: string | null }>;
const BLOCKED_COMPANY = "한익스프레스";

const COMPANY_OPTIONS = ["한익스프레스", "경산씨스템", "더블에스잡", "비상GLS"] as const;
const COMPANY_ORDER: Record<string, number> = {
  한익스프레스: 10,
  경산씨스템: 20,
  더블에스잡: 30,
  비상GLS: 40,
};

const WORK_PART_ORDER_LIST = ["관리자", "박스존", "이너존", "슬라존", "경량존", "담배존", "이형존"] as const;
const WORK_PART_ORDER: Record<string, number> = Object.fromEntries(
  WORK_PART_ORDER_LIST.map((v, i) => [v, (i + 1) * 10])
) as Record<string, number>;

const WORK_TABLE_OPTIONS = [
  "조출A 06:00~15:00",
  "조출B 07:00~16:00",
  "사무 08:30~17:30",
  "현장A 08:30~17:30",
  "현장B 09:30~18:30",
  "현장C 10:30~19:30",
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
  if (!(tm > bm || (tm === bm && td >= bd))) age -= 1;
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
    return "0" + digits.slice(2);
  }
  return s.replace(/[^\d]/g, "");
}

function formatKRPhone(raw: string | null): string {
  const digits = toKRLocalDigits(raw ?? "");
  if (!digits) return "-";
  if (digits.startsWith("010") && digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.startsWith("01") && digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.startsWith("02") && (digits.length === 9 || digits.length === 10)) {
    const mid = digits.length === 9 ? 3 : 4;
    return `${digits.slice(0, 2)}-${digits.slice(2, 2 + mid)}-${digits.slice(2 + mid)}`;
  }
  if (digits.length >= 9) return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(digits.length - 4)}`;
  return digits;
}

function workTableShort(v: string | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  return s.split(" ")[0] || "-";
}

function workTableTimeOnly(v: string): string {
  const parts = v.split(" ");
  if (parts.length <= 1) return v;
  return `${parts[0]} / ${parts.slice(1).join(" ").trim()}`;
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}

function normalizeApproval(v: string | null): "pending" | "approved" | "rejected" {
  const s = String(v ?? "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

function isWorkingNow(today: { inAt: string | null; outAt: string | null } | undefined): boolean {
  return !!today?.inAt && !today?.outAt;
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #E8EDF2",
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

function inputStyle(disabled?: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 38,
    padding: "0 11px",
    borderRadius: 7,
    border: "1px solid #D1D9E0",
    background: disabled ? "#F5F7F9" : "#fff",
    fontSize: 13,
    color: "#1E293B",
    outline: "none",
    boxSizing: "border-box",
  };
}

function buttonStyle(disabled?: boolean, dark?: boolean): React.CSSProperties {
  return {
    height: 38,
    padding: "0 16px",
    borderRadius: 7,
    border: dark ? "none" : "1px solid #D1D9E0",
    background: dark ? "#1E293B" : "#fff",
    color: dark ? "#fff" : "#374151",
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap" as const,
  };
}

function fieldLabelStyle(): React.CSSProperties {
  return { fontSize: 11, color: "#64748B", marginBottom: 5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" as const };
}

function sectionStyle(): React.CSSProperties {
  return {
    border: "1px solid #EEF2F7",
    borderRadius: 8,
    padding: 16,
    background: "#FAFBFC",
  };
}

export default function UserMasterPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [qName, setQName] = useState("");
  const [qPart, setQPart] = useState("");
  const [qCompany, setQCompany] = useState("");
  const [qWorkTable, setQWorkTable] = useState("");
  const [qForeigner, setQForeigner] = useState(false);

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [todayShiftMap, setTodayShiftMap] = useState<TodayShiftMap>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCompany, setBulkCompany] = useState("");
  const [bulkWorkTable, setBulkWorkTable] = useState("");
  const [isCompanyAdminRole, setIsCompanyAdminRole] = useState(false);
  const [nationalityOptions, setNationalityOptions] = useState<string[]>([]);
  const [nationalityCustom, setNationalityCustom] = useState("");

  const [f, setF] = useState({
    name: "",
    phone: "",
    birthdate: "",
    work_part: "",
    center: "",
    company_name: "",
    work_table: "",
    join_date: "",
    leave_date: "",
    nationality: "",
    visa: "",
    is_admin: false,
    is_general_admin: false,
    is_center_admin: false,
    is_company_admin: false,
    approval_status: "pending" as "pending" | "approved" | "rejected",
  });

  const age = useMemo(() => calcAge(f.birthdate || null), [f.birthdate]);
  const tenureDays = useMemo(() => calcTenureDays(f.join_date || null, f.leave_date || null), [f.join_date, f.leave_date]);
  const tenureText = useMemo(() => tenurePretty(tenureDays), [tenureDays]);
  const allowedCompanies = useMemo(
    () => COMPANY_OPTIONS.filter((c) => !(isCompanyAdminRole && c === BLOCKED_COMPANY)),
    [isCompanyAdminRole]
  );

  const needsExtraInfo = (r: ProfileRow) => !r.company_name?.trim() || !r.work_table?.trim();

  const sortRows = (list: ProfileRow[]) => {
    return [...list].sort((a, b) => {
      const aTop = normalizeApproval(a.approval_status) === "pending" || needsExtraInfo(a) ? 0 : 1;
      const bTop = normalizeApproval(b.approval_status) === "pending" || needsExtraInfo(b) ? 0 : 1;
      if (aTop !== bTop) return aTop - bTop;

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

      const at = toKRLocalDigits(String(a.phone ?? ""));
      const bt = toKRLocalDigits(String(b.phone ?? ""));
      const byPhone = at.localeCompare(bt, "ko");
      if (byPhone !== 0) return byPhone;

      return String(a.id).localeCompare(String(b.id));
    });
  };

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error("로그인 세션이 없습니다.");

      const params = new URLSearchParams();
      if (qName.trim()) params.set("qName", qName.trim());
      if (qPart.trim()) params.set("qPart", qPart.trim());
      if (qCompany.trim()) params.set("qCompany", qCompany.trim());
      if (qWorkTable.trim()) params.set("qWorkTable", qWorkTable.trim());

      const res = await fetch(`/api/admin/user-master/list?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        message?: string;
        rows?: ProfileRow[];
        todayShiftMap?: TodayShiftMap;
        isCompanyAdminRole?: boolean;
        nationalityOptions?: string[];
      };
      if (!res.ok || !payload?.ok) throw new Error(payload?.message || "데이터를 불러오지 못했습니다.");

      setIsCompanyAdminRole(!!payload.isCompanyAdminRole);
      setRows(sortRows(payload.rows ?? []));
      setTodayShiftMap(payload.todayShiftMap ?? {});
      setNationalityOptions(payload.nationalityOptions ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
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

  useEffect(() => {
    if (!isCompanyAdminRole) return;
    if (qCompany === BLOCKED_COMPANY) setQCompany("");
    if (bulkCompany === BLOCKED_COMPANY) setBulkCompany("");
    if (f.company_name === BLOCKED_COMPANY) setF((p) => ({ ...p, company_name: "" }));
  }, [isCompanyAdminRole, qCompany, bulkCompany, f.company_name]);

  const openEdit = (r: ProfileRow) => {
    const ap = normalizeApproval(r.approval_status);
    const nat = r.nationality ?? "";
    const isCustomNat = nat.trim() !== "" && !nationalityOptions.includes(nat.trim());
    setSelected(r);
    setNationalityCustom(isCustomNat ? nat.trim() : "");
    setF({
      name: r.name ?? "",
      phone: toKRLocalDigits(r.phone ?? ""),
      birthdate: r.birthdate ?? "",
      work_part: r.work_part ?? "",
      center: r.center ?? "",
      company_name: r.company_name ?? "",
      work_table: r.work_table ?? "",
      join_date: r.join_date ?? "",
      leave_date: r.leave_date ?? "",
      nationality: isCustomNat ? "__custom__" : nat,
      visa: r.visa ?? "",
      is_admin: !!r.is_admin,
      is_general_admin: !!r.is_general_admin,
      is_center_admin: !!r.is_center_admin,
      is_company_admin: !!r.is_company_admin,
      approval_status: ap,
    });
  };

  const closeEdit = () => setSelected(null);

  const rejectAndDeleteUser = async (id: string) => {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (!token) throw new Error("로그인 세션이 없습니다.");

    const res = await fetch("/api/admin/user-master/reject-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId: id }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) throw new Error(payload?.message || "반려 삭제에 실패했습니다.");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setErr(null);
    try {
      if (isCompanyAdminRole && f.company_name.trim() === BLOCKED_COMPANY) {
        throw new Error("업체관리자는 한익스프레스 데이터를 볼 수 없습니다.");
      }
      if (f.approval_status === "approved") {
        const missing: string[] = [];
        if (!f.name.trim()) missing.push("이름");
        if (!toKRLocalDigits(f.phone)) missing.push("전화번호");
        if (!f.birthdate) missing.push("생년월일");
        if (!f.work_part.trim()) missing.push("작업파트");
        if (missing.length > 0) throw new Error(`승인하려면 필수 정보를 입력해 주세요: ${missing.join(", ")}`);
      }
      const lockedIsAdmin = isCompanyAdminRole ? !!selected.is_admin : !!f.is_admin;
      const phoneToSave = toKRLocalDigits(f.phone) || null;
      const nat = (f.nationality === "__custom__" ? nationalityCustom : f.nationality).trim();
      const payload = {
        userId: selected.id,
        name: f.name.trim() || null,
        phone: phoneToSave,
        birthdate: f.birthdate || null,
        work_part: f.work_part.trim() || null,
        center: f.center.trim() || null,
        company_name: f.company_name.trim() || null,
        work_table: f.work_table.trim() || null,
        join_date: f.join_date || null,
        leave_date: f.leave_date || null,
        nationality: nat || null,
        visa: (nat && nat.toUpperCase() !== "KR" && nat !== "한국") ? (f.visa.trim() || null) : null,
        is_admin: lockedIsAdmin,
        is_general_admin: f.is_general_admin,
        is_center_admin: f.is_center_admin,
        is_company_admin: f.is_company_admin,
        approval_status: f.approval_status,
      };
      if (payload.approval_status === "rejected") {
        await rejectAndDeleteUser(selected.id);
        await load();
        closeEdit();
        return;
      }

      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error("로그인 세션이 없습니다.");
      const res = await fetch("/api/admin/user-master/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result?.ok) throw new Error(result?.message || "저장에 실패했습니다.");
      await load();
      closeEdit();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!bulkCompany.trim() && !bulkWorkTable.trim()) {
      setErr("일괄 적용할 회사명 또는 근무테이블을 선택해 주세요.");
      return;
    }

    setBulkSaving(true);
    setErr(null);
    try {
      if (isCompanyAdminRole && bulkCompany.trim() === BLOCKED_COMPANY) {
        throw new Error("업체관리자는 한익스프레스로 일괄 변경할 수 없습니다.");
      }
      const payload: { company_name?: string; work_table?: string } = {};
      if (bulkCompany.trim()) payload.company_name = bulkCompany.trim();
      if (bulkWorkTable.trim()) payload.work_table = bulkWorkTable.trim();
      const { error } = await supabase.from("profiles").update(payload).in("id", ids);
      if (error) throw error;

      await load();
      setSelectedIds(new Set());
      setBulkCompany("");
      setBulkWorkTable("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "일괄 적용에 실패했습니다.");
    } finally {
      setBulkSaving(false);
    }
  };

  const updateApprovalInline = async (id: string, next: "pending" | "approved" | "rejected") => {
    setErr(null);
    try {
      if (next === "rejected") {
        await rejectAndDeleteUser(id);
      } else {
        const { error } = await supabase.from("profiles").update({ approval_status: next }).eq("id", id);
        if (error) throw error;
      }
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "상태 변경에 실패했습니다.");
    }
  };

  const displayedRows = useMemo(() => {
    if (!qForeigner) return rows;
    return rows.filter((r) => {
      const nat = (r.nationality ?? "").trim().toUpperCase();
      return nat !== "" && nat !== "KR" && nat !== "한국";
    });
  }, [rows, qForeigner]);

  const partOptions = useMemo(() => {
    const arr = uniq(rows.map((r) => String(r.work_part ?? "")));
    return arr.sort((a, b) => {
      const ao = WORK_PART_ORDER[a] ?? 9999;
      const bo = WORK_PART_ORDER[b] ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.localeCompare(b, "ko");
    });
  }, [rows]);

  const selectedCount = selectedIds.size;
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

  const statusBadge = (ap: "pending" | "approved" | "rejected", working: boolean, missingInfo: boolean, r: ProfileRow) => {
    if (ap !== "approved") {
      return (
        <select
          value={ap}
          onChange={(e) => updateApprovalInline(r.id, e.target.value as "pending" | "approved" | "rejected")}
          style={{ height: 30, padding: "0 8px", borderRadius: 6, border: "1px solid #D1D9E0", fontSize: 12, fontWeight: 700, background: "#FFF9F0", color: "#92400E", cursor: "pointer" }}
        >
          <option value="pending">확인대기</option>
          <option value="approved">승인</option>
          <option value="rejected">반려</option>
        </select>
      );
    }
    if (missingInfo) return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 800 }}>정보부족</span>;
    if (working) return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, background: "#ECFDF5", color: "#065F46", fontSize: 11, fontWeight: 800 }}>근무중</span>;
    return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, background: "#F1F5F9", color: "#475569", fontSize: 11, fontWeight: 700 }}>승인</span>;
  };

  const TD: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151", whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1540, margin: "0 auto", fontFamily: "Pretendard, system-ui, -apple-system, sans-serif", color: "#1E293B" }}>

      {/* ── 헤더 ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A" }}>운영/현장 사용자 마스터</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94A3B8" }}>조회 · 상태처리 · 일괄수정 · 상세수정을 한 화면에서 관리합니다.</p>
        </div>
        <button onClick={load} disabled={loading} style={{ ...buttonStyle(loading), display: "flex", alignItems: "center", gap: 6 }}>
          {loading && <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #D1D9E0", borderTopColor: "#374151", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      {/* ── 검색 필터 ── */}
      <div style={{ ...card, padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1.3fr auto auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <div style={fieldLabelStyle()}>이름</div>
            <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="이름 검색" style={inputStyle()} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <div>
            <div style={fieldLabelStyle()}>작업파트</div>
            <select value={qPart} onChange={(e) => setQPart(e.target.value)} style={inputStyle()}>
              <option value="">전체</option>
              {partOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabelStyle()}>회사명</div>
            <select value={qCompany} onChange={(e) => setQCompany(e.target.value)} style={inputStyle()}>
              <option value="">전체</option>
              {allowedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabelStyle()}>근무테이블</div>
            <select value={qWorkTable} onChange={(e) => setQWorkTable(e.target.value)} style={inputStyle()}>
              <option value="">전체</option>
              {WORK_TABLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={load} style={buttonStyle(false, true)}>조회</button>
          <button
            onClick={() => setQForeigner((v) => !v)}
            style={{ ...buttonStyle(false, false), background: qForeigner ? "#1E293B" : "#F1F5F9", color: qForeigner ? "#fff" : "#475569", border: "1px solid " + (qForeigner ? "#1E293B" : "#D1D9E0") }}
          >
            외국인만
          </button>
        </div>
      </div>

      {/* ── 일괄 작업 바 ── */}
      <div style={{ ...card, padding: "12px 18px", marginBottom: 12, background: selectedCount > 0 ? "#FFFBF5" : "#fff", border: selectedCount > 0 ? "1px solid #FDE68A" : "1px solid #E8EDF2", transition: "all 0.15s" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1px 1fr 1fr auto auto", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: selectedCount > 0 ? "#92400E" : "#94A3B8" }}>
            선택 <span style={{ fontSize: 15, fontWeight: 900, color: selectedCount > 0 ? "#B45309" : "#CBD5E1" }}>{selectedCount}</span>명
          </div>
          <div style={{ background: "#E8EDF2", height: 28, width: 1 }} />
          <div>
            <div style={fieldLabelStyle()}>회사명 일괄 변경</div>
            <select value={bulkCompany} onChange={(e) => setBulkCompany(e.target.value)} style={inputStyle(selectedCount === 0)}>
              <option value="">(변경 안함)</option>
              {allowedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabelStyle()}>근무테이블 일괄 변경</div>
            <select value={bulkWorkTable} onChange={(e) => setBulkWorkTable(e.target.value)} style={inputStyle(selectedCount === 0)}>
              <option value="">(변경 안함)</option>
              {WORK_TABLE_OPTIONS.map((t) => <option key={t} value={t}>{workTableTimeOnly(t)}</option>)}
            </select>
          </div>
          <button onClick={applyBulk} disabled={bulkSaving || selectedCount === 0} style={buttonStyle(bulkSaving || selectedCount === 0, true)}>
            {bulkSaving ? "적용 중…" : "일괄 적용"}
          </button>
          <button onClick={() => setSelectedIds(new Set())} disabled={selectedCount === 0} style={buttonStyle(selectedCount === 0)}>
            선택 해제
          </button>
        </div>
      </div>

      {/* ── 에러 ── */}
      {err && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
          {err}
        </div>
      )}

      {/* ── 테이블 ── */}
      <div style={{ ...card, overflow: "hidden", position: "relative", minHeight: loading ? 260 : undefined }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.85)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, border: "4px solid #E2E8F0", borderTopColor: "#1E293B", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontSize: 15, color: "#475569", fontWeight: 700, letterSpacing: "-0.01em" }}>데이터를 불러오는 중…</span>
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ ...TD, padding: "10px 12px", fontWeight: 700, color: "#64748B", borderBottom: "2px solid #E8EDF2", width: 44 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                {["센터", "회사명", "파트", "이름", "전화번호", "나이", "근무테이블", "입사일", "퇴사일", "근속", "상태", ""].map((h, i) => (
                  <th key={i} style={{ ...TD, padding: "10px 12px", fontWeight: 700, color: "#64748B", fontSize: 12, textAlign: "left", borderBottom: "2px solid #E8EDF2" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={12} style={{ padding: 32, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                displayedRows.map((r) => {
                  const ap = normalizeApproval(r.approval_status);
                  const approved = ap === "approved";
                  const working = approved ? isWorkingNow(todayShiftMap[r.id]) : false;
                  const missingInfo = needsExtraInfo(r);
                  const ageValue = calcAge(r.birthdate);
                  const tenureValue = calcTenureDays(r.join_date, r.leave_date);
                  const isSelected = selectedIds.has(r.id);

                  return (
                    <tr key={r.id} style={{ background: isSelected ? "#FFFBF5" : "#fff" }}>
                      <td style={TD}><input type="checkbox" checked={isSelected} onChange={() => toggleOne(r.id)} /></td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.center ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.company_name ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.work_part ?? "-"}</td>
                      <td style={{ ...TD, fontWeight: 700, color: "#0F172A" }}>{r.name ?? "-"}</td>
                      <td style={{ ...TD, color: "#475569" }}>{formatKRPhone(r.phone)}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{ageValue == null ? "-" : `${ageValue}세`}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{workTableShort(r.work_table)}</td>
                      <td style={{ ...TD, color: "#94A3B8", fontSize: 12 }}>{r.join_date ?? "-"}</td>
                      <td style={{ ...TD, color: "#94A3B8", fontSize: 12 }}>{r.leave_date ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{tenurePretty(tenureValue)}</td>
                      <td style={TD}>{statusBadge(ap, working, missingInfo, r)}</td>
                      <td style={TD}>
                        <button
                          onClick={() => openEdit(r)}
                          style={{ height: 30, padding: "0 14px", borderRadius: 6, border: "1px solid #D1D9E0", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#374151" }}
                        >
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
        {displayedRows.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#94A3B8", textAlign: "right" }}>
            총 {displayedRows.length.toLocaleString()}명{qForeigner ? " (외국인 필터 적용)" : ""}
          </div>
        )}
      </div>

      {/* ── 수정 모달 ── */}
      {selected && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 9999 }}
        >
          <div style={{ width: "100%", maxWidth: 780, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px rgba(2,6,23,0.28)" }}>

            {/* 모달 헤더 */}
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>사용자 수정</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#94A3B8" }}>{selected.name ?? "-"} · {selected.company_name ?? "-"}</div>
              </div>
              <button onClick={closeEdit} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8EDF2", background: "#F8FAFC", fontSize: 16, cursor: "pointer", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* 모달 바디 */}
            <div style={{ padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* 기본 정보 */}
              <section style={sectionStyle()}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>기본 정보</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={fieldLabelStyle()}>이름 *</div>
                    <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>전화번호 (숫자만) *</div>
                    <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} style={inputStyle()} />
                    <div style={{ marginTop: 4, fontSize: 11, color: "#94A3B8" }}>{formatKRPhone(f.phone)}</div>
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>생년월일 *</div>
                    <input type="date" value={f.birthdate} onChange={(e) => setF((p) => ({ ...p, birthdate: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>작업파트 *</div>
                    <select value={f.work_part} onChange={(e) => setF((p) => ({ ...p, work_part: e.target.value }))} style={inputStyle()}>
                      <option value="">-</option>
                      {WORK_PART_ORDER_LIST.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>국적</div>
                    <select
                      value={f.nationality}
                      onChange={(e) => {
                        const v = e.target.value;
                        setF((p) => ({ ...p, nationality: v, visa: (v.toUpperCase() === "KR" || v === "한국") ? "" : p.visa }));
                        if (v !== "__custom__") setNationalityCustom("");
                      }}
                      style={inputStyle()}
                    >
                      <option value="">-</option>
                      {nationalityOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                      <option value="__custom__">직접입력</option>
                    </select>
                    {f.nationality === "__custom__" && (
                      <input value={nationalityCustom} onChange={(e) => setNationalityCustom(e.target.value)} style={{ ...inputStyle(), marginTop: 6 }} placeholder="국적 직접 입력" />
                    )}
                  </div>
                  {(() => { const nat = (f.nationality === "__custom__" ? nationalityCustom : f.nationality).trim().toUpperCase(); return nat !== "" && nat !== "KR" && nat !== "한국"; })() && (
                    <div>
                      <div style={fieldLabelStyle()}>비자 종류</div>
                      <input value={f.visa} onChange={(e) => setF((p) => ({ ...p, visa: e.target.value }))} style={inputStyle()} placeholder="예: E-9, F-4, F-6" />
                    </div>
                  )}
                </div>
              </section>

              {/* 근무 정보 */}
              <section style={sectionStyle()}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>근무 정보</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={fieldLabelStyle()}>센터 <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>(회원가입 시 입력)</span></div>
                    <input value={f.center} onChange={(e) => setF((p) => ({ ...p, center: e.target.value }))} style={inputStyle()} placeholder="-" />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>회사명</div>
                    <select value={f.company_name} onChange={(e) => setF((p) => ({ ...p, company_name: e.target.value }))} style={inputStyle()}>
                      <option value="">-</option>
                      {allowedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>근무테이블</div>
                    <select value={f.work_table} onChange={(e) => setF((p) => ({ ...p, work_table: e.target.value }))} style={inputStyle()}>
                      <option value="">-</option>
                      {WORK_TABLE_OPTIONS.map((t) => <option key={t} value={t}>{workTableTimeOnly(t)}</option>)}
                    </select>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#94A3B8" }}>표시: {workTableShort(f.work_table)}</div>
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>입사일</div>
                    <input type="date" value={f.join_date} onChange={(e) => setF((p) => ({ ...p, join_date: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>퇴사일</div>
                    <input type="date" value={f.leave_date} onChange={(e) => setF((p) => ({ ...p, leave_date: e.target.value }))} style={inputStyle()} />
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <span style={{ padding: "5px 12px", borderRadius: 20, background: "#F1F5F9", fontSize: 12, fontWeight: 700, color: "#475569" }}>나이 {age == null ? "-" : `${age}세`}</span>
                  <span style={{ padding: "5px 12px", borderRadius: 20, background: "#F1F5F9", fontSize: 12, fontWeight: 700, color: "#475569" }}>근속 {tenureText}</span>
                </div>
              </section>

              {/* 승인 및 권한 */}
              <section style={sectionStyle()}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>승인 및 권한</div>
                <div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 160 }}>
                      <div style={fieldLabelStyle()}>승인 상태</div>
                      <select value={f.approval_status} onChange={(e) => setF((p) => ({ ...p, approval_status: e.target.value as "pending" | "approved" | "rejected" }))} style={inputStyle()}>
                        <option value="pending">확인대기</option>
                        <option value="approved">승인</option>
                        <option value="rejected">반려</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "6px 20px", paddingBottom: 6 }}>
                      {[
                        { label: "메인관리자", key: "is_admin" as const, disabled: isCompanyAdminRole },
                        { label: "일반관리자", key: "is_general_admin" as const },
                        { label: "센터관리자", key: "is_center_admin" as const },
                        { label: "업체관리자", key: "is_company_admin" as const },
                      ].map(({ label, key, disabled }) => (
                        <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, color: "#374151", cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                          <input
                            type="checkbox"
                            checked={!!f[key]}
                            disabled={disabled}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setF((p) => ({
                                ...p,
                                ...(v ? { is_admin: false, is_general_admin: false, is_center_admin: false, is_company_admin: false } : {}),
                                [key]: v,
                              }));
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {f.approval_status === "approved" && (!f.name.trim() || !toKRLocalDigits(f.phone) || !f.birthdate || !f.work_part.trim()) && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#DC2626", fontWeight: 700 }}>이름·전화번호·생년월일·작업파트를 모두 입력해야 승인됩니다.</div>
                  )}
                </div>
              </section>
            </div>

            {/* 모달 푸터 */}
            <div style={{ padding: "14px 22px", borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>승인된 사용자만 근무중 상태가 표시됩니다.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeEdit} style={buttonStyle(false)}>취소</button>
                <button onClick={save} disabled={saving} style={buttonStyle(saving, true)}>{saving ? "저장 중…" : "저장"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
