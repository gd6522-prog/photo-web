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

  // 기사 전용
  car_no: string | null; // "1" or "1,2"
  delivery_type: string | null; // 당일/전일/익일
  car_no_2?: string | null;
  car_no_3?: string | null;
  car_no_4?: string | null;
  delivery_type_2?: string | null;
  delivery_type_3?: string | null;
  delivery_type_4?: string | null;
  vehicle_type: string | null; // 1.5T/2.5T/3.5T
  carrier: string | null; // 운수사
  garage: string | null; // 차고지
  hipass: string | null; // 하이패스
  vehicle_number: string | null; // 차량번호판 (예: 경기12가3456)

  company_name: string | null; // 기존 데이터 호환용
  join_date: string | null;
  leave_date: string | null;

  created_at?: string | null;
};


const DELIVERY_OPTIONS = ["당일", "전일", "익일"] as const;
const VEHICLE_OPTIONS = ["1.5T", "2.5T", "3.5T"] as const;

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #E8EDF2",
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

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
  return { border: "1px solid #EEF2F7", borderRadius: 8, padding: 16, background: "#FAFBFC" };
}

function normalizeApproval(v: string | null): "pending" | "approved" | "rejected" {
  const s = String(v ?? "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}


type TodayShiftMap = Record<string, { inAt: string | null; outAt: string | null }>;

function isWorkingNow(today: { inAt: string | null; outAt: string | null } | undefined): boolean {
  return !!today?.inAt && !today?.outAt;
}


function isDriverPart(part: string | null | undefined): boolean {
  const s = String(part ?? "").trim();
  if (!s) return false;
  return s === "기사" || s.includes("기사");
}

// 차량번호는 숫자만 허용하고 중복 제거 후 오름차순 정렬
function normalizeCarNoInput(...rawValues: string[]): string | null {
  const cleanOne = (v: string) => String(v ?? "").replace(/[^\d]/g, "").trim();
  const nums = rawValues
    .map(cleanOne)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => String(parseInt(x, 10)))
    .filter((x) => x !== "NaN");

  if (nums.length === 0) return null;

  const unique = Array.from(new Set(nums));
  unique.sort((x, y) => Number(x) - Number(y));

  return unique.slice(0, 4).join(",");
}

function splitCarNo(carNo: string | null): { a: string; b: string; c: string; d: string } {
  const raw = String(carNo ?? "").trim();
  if (!raw) return { a: "", b: "", c: "", d: "" };
  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  return { a: parts[0] ?? "", b: parts[1] ?? "", c: parts[2] ?? "", d: parts[3] ?? "" };
}

function displayCarNo(carNo: string | null): string {
  const raw = String(carNo ?? "").trim();
  if (!raw) return "-";
  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return "-";
  if (parts.length === 1) return parts[0];
  return parts.join(" / ");
}

function primaryCarNo(carNo: string | null): number {
  const values = String(carNo ?? "")
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x));
  if (values.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...values);
}

function displayDeliveryTypes(row: ProfileRow): string {
  const values = [row.delivery_type, row.delivery_type_2, row.delivery_type_3, row.delivery_type_4]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return values.length ? values.join(" / ") : "-";
}

function displayCarWithDelivery(row: ProfileRow): string {
  const cars = String(row.car_no ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const deliveries = [row.delivery_type, row.delivery_type_2, row.delivery_type_3, row.delivery_type_4].map((value) =>
    String(value ?? "").trim()
  );

  const parts = cars.map((car, index) => {
    const delivery = deliveries[index];
    return delivery ? `${car}(${delivery})` : car;
  });

  return parts.length ? parts.join(" / ") : "-";
}

function normalizePick(v: string): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export default function DriverMasterPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [qName, setQName] = useState("");
  const [qCarNo, setQCarNo] = useState("");
  const [qDelivery, setQDelivery] = useState<string>("");
  const [qVehicle, setQVehicle] = useState<string>("");
  const [qCarrier, setQCarrier] = useState("");

  // list & selection
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [todayShiftMap, setTodayShiftMap] = useState<TodayShiftMap>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // bulk
  const [bulkCarrier, setBulkCarrier] = useState<string>("");
  const [bulkVehicle, setBulkVehicle] = useState<string>("");
  const [bulkDelivery, setBulkDelivery] = useState<string>("");

  // form
  const [f, setF] = useState({
    name: "",
    phone: "",
    birthdate: "",
    work_part: "기사",

    car_no_1: "",
    car_no_2: "",
    car_no_3: "",
    car_no_4: "",

    delivery_type: "",
    delivery_type_2: "",
    delivery_type_3: "",
    delivery_type_4: "",
    vehicle_type: "",
    carrier: "",
    join_date: "",
    leave_date: "",
    garage: "",
    hipass: "",
    vehicle_number: "",

    approval_status: "pending" as "pending" | "approved" | "rejected",
  });

  const age = useMemo(() => calcAge(f.birthdate || null), [f.birthdate]);
  const tenureDays = useMemo(() => calcTenureDays(f.join_date || null, f.leave_date || null), [f.join_date, f.leave_date]);
  const tenureText = useMemo(() => tenurePretty(tenureDays), [tenureDays]);

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

  const clearSelection = () => setSelectedIds(new Set());

  const openEdit = (r: ProfileRow) => {
    const ap = normalizeApproval(r.approval_status);
    const car = splitCarNo(r.car_no);

    setSelected(r);
    setF({
      name: r.name ?? "",
      phone: toKRLocalDigits(r.phone ?? ""),
      birthdate: r.birthdate ?? "",
      work_part: r.work_part ?? "기사",

      car_no_1: car.a,
      car_no_2: r.car_no_2 ?? car.b,
      car_no_3: r.car_no_3 ?? car.c,
      car_no_4: r.car_no_4 ?? car.d,

      delivery_type: r.delivery_type ?? "",
      delivery_type_2: r.delivery_type_2 ?? "",
      delivery_type_3: r.delivery_type_3 ?? "",
      delivery_type_4: r.delivery_type_4 ?? "",
      vehicle_type: r.vehicle_type ?? "",
      carrier: r.carrier ?? "",
      join_date: r.join_date ?? "",
      leave_date: r.leave_date ?? "",
      garage: r.garage ?? "",
      hipass: r.hipass ?? "",
      vehicle_number: r.vehicle_number ?? "",

      approval_status: ap,
    });
  };

  const closeEdit = () => setSelected(null);

  const load = async () => {
    setLoading(true);
    setErr(null);

    try {
      // 기사만 조회
      let q = supabase
        .from("profiles")
        .select(
          "id,approval_status,name,phone,birthdate,work_part,car_no,car_no_2,car_no_3,car_no_4,delivery_type,delivery_type_2,delivery_type_3,delivery_type_4,vehicle_type,carrier,join_date,leave_date,garage,hipass,vehicle_number,created_at"
        )
        .ilike("work_part", "%기사%");

      const name = qName.trim();
      const car = qCarNo.trim().replace(/[^\d]/g, "");
      const carrier = qCarrier.trim();
      const delivery = qDelivery.trim();
      const vehicle = qVehicle.trim();

      if (name) q = q.ilike("name", `%${name}%`);
      if (carrier) q = q.ilike("carrier", `%${carrier}%`);
      if (vehicle) q = q.eq("vehicle_type", vehicle);

      const { data, error } = await q;
      if (error) throw error;

      let list = (data ?? []) as ProfileRow[];
      if (car) {
        list = list.filter((r) => String(r.car_no ?? "").split(",").map((x) => x.trim()).includes(car));
      }
      if (delivery) {
        list = list.filter((r) => [r.delivery_type, r.delivery_type_2, r.delivery_type_3, r.delivery_type_4].some((value) => String(value ?? "").trim() === delivery));
      }

      // 정렬: 승인대기 우선, 그 안에서는 이름 오름차순
      list.sort((a, b) => {
        const aApproval = normalizeApproval(a.approval_status);
        const bApproval = normalizeApproval(b.approval_status);
        if (aApproval !== bApproval) {
          if (aApproval === "pending") return -1;
          if (bApproval === "pending") return 1;
        }

        const an = String(a.name ?? "").trim();
        const bn = String(b.name ?? "").trim();
        const byName = an.localeCompare(bn, "ko");
        if (byName !== 0) return byName;

        const aCar = primaryCarNo(a.car_no);
        const bCar = primaryCarNo(b.car_no);
        if (aCar !== bCar) return aCar - bCar;

        const ah = displayCarNo(a.car_no);
        const bh = displayCarNo(b.car_no);
        const c2 = ah.localeCompare(bh, "ko", { numeric: true });
        if (c2 !== 0) return c2;
        return String(a.id).localeCompare(String(b.id));
      });

      setRows(list);

      // 오늘 근무 현황
      const ids = list.map((r) => r.id);
      const shiftMap: TodayShiftMap = {};
      if (ids.length > 0) {
        const todayYmd = kstTodayYMD();
        const { data: shifts } = await supabase
          .from("work_shifts")
          .select("user_id,clock_in_at,clock_out_at")
          .eq("work_date", todayYmd)
          .in("user_id", ids);
        for (const s of (shifts ?? []) as { user_id: string; clock_in_at: string | null; clock_out_at: string | null }[]) {
          shiftMap[s.user_id] = { inAt: s.clock_in_at, outAt: s.clock_out_at };
        }
      }
      setTodayShiftMap(shiftMap);
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
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "상태 변경 실패"));
    }
  };

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
    if (!res.ok || !payload?.ok) throw new Error(payload?.message || "반려 및 삭제 처리에 실패했습니다.");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setErr(null);

    try {
      const phoneDigits = toKRLocalDigits(f.phone);
      const phoneToSave = phoneDigits ? phoneDigits : null;

      // 기사 마스터이므로 work_part는 기사로 보정
      const workPartToSave = isDriverPart(f.work_part) ? f.work_part.trim() : "기사";
      const carNoToSave = normalizeCarNoInput(f.car_no_1, f.car_no_2, f.car_no_3, f.car_no_4);

      const payload: any = {
        name: f.name.trim() || null,
        phone: phoneToSave,
        birthdate: f.birthdate || null,
        work_part: workPartToSave,

        car_no: carNoToSave,
        car_no_2: normalizePick(f.car_no_2),
        car_no_3: normalizePick(f.car_no_3),
        car_no_4: normalizePick(f.car_no_4),
        delivery_type: normalizePick(f.delivery_type),
        delivery_type_2: normalizePick(f.delivery_type_2),
        delivery_type_3: normalizePick(f.delivery_type_3),
        delivery_type_4: normalizePick(f.delivery_type_4),
        vehicle_type: normalizePick(f.vehicle_type),
        carrier: normalizePick(f.carrier),
        join_date: f.join_date || null,
        leave_date: f.leave_date || null,
        garage: normalizePick(f.garage),
        hipass: normalizePick(f.hipass),
        vehicle_number: f.vehicle_number.trim() || null,

        approval_status: f.approval_status || "pending",
      };

      if (payload.approval_status === "rejected") {
        await rejectAndDeleteUser(selected.id);
        await load();
        closeEdit();
        return;
      }

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

    if (!bulkCarrier.trim() && !bulkVehicle.trim() && !bulkDelivery.trim()) {
      setErr("일괄 적용할 값(운수사/차종/배송구분) 중 최소 1개를 선택해 주세요.");
      return;
    }

    setBulkSaving(true);
    setErr(null);

    try {
      const payload: any = {};
      if (bulkCarrier.trim()) payload.carrier = bulkCarrier.trim();
      if (bulkVehicle.trim()) payload.vehicle_type = bulkVehicle.trim();
      if (bulkDelivery.trim()) payload.delivery_type = bulkDelivery.trim();

      const { error } = await supabase.from("profiles").update(payload).in("id", ids);
      if (error) throw error;

      await load();
      clearSelection();
      setBulkCarrier("");
      setBulkVehicle("");
      setBulkDelivery("");
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "일괄 적용 실패"));
    } finally {
      setBulkSaving(false);
    }
  };


  const TD: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", fontSize: 13, color: "#374151", whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1600, margin: "0 auto", fontFamily: "Pretendard, system-ui, -apple-system, sans-serif", color: "#1E293B" }}>

      {/* ── 헤더 ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A" }}>기사 사용자 마스터</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94A3B8" }}>기사 조회 · 차량정보 · 상태처리 · 일괄수정을 한 화면에서 관리합니다.</p>
        </div>
        <button onClick={load} disabled={loading} style={buttonStyle(loading)}>
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      {/* ── 검색 필터 ── */}
      <div style={{ ...card, padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.8fr 1.1fr 0.9fr 0.8fr auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <div style={fieldLabelStyle()}>이름</div>
            <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="기사 이름 검색" style={inputStyle()} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <div>
            <div style={fieldLabelStyle()}>차량번호</div>
            <input value={qCarNo} onChange={(e) => setQCarNo(e.target.value)} placeholder="예: 1" style={inputStyle()} inputMode="numeric" />
          </div>
          <div>
            <div style={fieldLabelStyle()}>운수사</div>
            <input value={qCarrier} onChange={(e) => setQCarrier(e.target.value)} placeholder="운수사 검색" style={inputStyle()} />
          </div>
          <div>
            <div style={fieldLabelStyle()}>배송구분</div>
            <select value={qDelivery} onChange={(e) => setQDelivery(e.target.value)} style={inputStyle()}>
              <option value="">전체</option>
              {DELIVERY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabelStyle()}>차종</div>
            <select value={qVehicle} onChange={(e) => setQVehicle(e.target.value)} style={inputStyle()}>
              <option value="">전체</option>
              {VEHICLE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <button onClick={load} style={buttonStyle(false, true)}>조회</button>
        </div>
      </div>

      {/* ── 일괄 작업 바 ── */}
      <div style={{ ...card, padding: "12px 18px", marginBottom: 12, background: selectedCount > 0 ? "#FFFBF5" : "#fff", border: selectedCount > 0 ? "1px solid #FDE68A" : "1px solid #E8EDF2" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1px 1fr 1fr 1fr auto auto", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: selectedCount > 0 ? "#92400E" : "#94A3B8" }}>
            선택 <span style={{ fontSize: 15, fontWeight: 900, color: selectedCount > 0 ? "#B45309" : "#CBD5E1" }}>{selectedCount}</span>명
          </div>
          <div style={{ background: "#E8EDF2", height: 28, width: 1 }} />
          <div>
            <div style={fieldLabelStyle()}>운수사 일괄 변경</div>
            <input value={bulkCarrier} onChange={(e) => setBulkCarrier(e.target.value)} placeholder="(변경 안함)" style={inputStyle(selectedCount === 0)} />
          </div>
          <div>
            <div style={fieldLabelStyle()}>차종 일괄 변경</div>
            <select value={bulkVehicle} onChange={(e) => setBulkVehicle(e.target.value)} style={inputStyle(selectedCount === 0)}>
              <option value="">(변경 안함)</option>
              {VEHICLE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabelStyle()}>배송구분 일괄 변경</div>
            <select value={bulkDelivery} onChange={(e) => setBulkDelivery(e.target.value)} style={inputStyle(selectedCount === 0)}>
              <option value="">(변경 안함)</option>
              {DELIVERY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <button onClick={applyBulk} disabled={bulkSaving || selectedCount === 0} style={buttonStyle(bulkSaving || selectedCount === 0, true)}>
            {bulkSaving ? "적용 중…" : "일괄 적용"}
          </button>
          <button onClick={clearSelection} disabled={selectedCount === 0} style={buttonStyle(selectedCount === 0)}>선택 해제</button>
        </div>
      </div>

      {/* ── 에러 ── */}
      {err && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>
          {err}
        </div>
      )}

      {/* ── 테이블 ── */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ ...TD, padding: "10px 12px", fontWeight: 700, color: "#64748B", borderBottom: "2px solid #E8EDF2", width: 44 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                {["이름", "호차 / 배송구분", "차량번호판", "차종", "운수사", "전화번호", "차고지", "상태", ""].map((h, i) => (
                  <th key={i} style={{ ...TD, padding: "10px 12px", fontWeight: 700, color: "#64748B", fontSize: 12, textAlign: "left", borderBottom: "2px solid #E8EDF2" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const ap = normalizeApproval(r.approval_status);
                  const approved = ap === "approved";
                  const working = approved ? isWorkingNow(todayShiftMap[r.id]) : false;
                  const isSelected = selectedIds.has(r.id);
                  return (
                    <tr key={r.id} style={{ background: isSelected ? "#FFFBF5" : "#fff" }}>
                      <td style={TD}><input type="checkbox" checked={isSelected} onChange={() => toggleOne(r.id)} /></td>
                      <td style={{ ...TD, fontWeight: 700, color: "#0F172A" }}>{r.name ?? "-"}</td>
                      <td style={{ ...TD, color: "#475569" }}>{displayCarWithDelivery(r)}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.vehicle_number ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.vehicle_type ?? "-"}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.carrier ?? "-"}</td>
                      <td style={{ ...TD, color: "#475569" }}>{formatKRPhone(r.phone)}</td>
                      <td style={{ ...TD, color: "#64748B" }}>{r.garage ?? "-"}</td>
                      <td style={TD}>
                        {!approved ? (
                          <select value={ap} onChange={(e) => updateApprovalInline(r.id, e.target.value as "pending" | "approved" | "rejected")} style={{ height: 30, padding: "0 8px", borderRadius: 6, border: "1px solid #D1D9E0", fontSize: 12, fontWeight: 700, background: "#FFF9F0", color: "#92400E", cursor: "pointer" }}>
                            <option value="pending">확인대기</option>
                            <option value="approved">승인</option>
                            <option value="rejected">반려</option>
                          </select>
                        ) : working ? (
                          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, background: "#ECFDF5", color: "#065F46", fontSize: 11, fontWeight: 800 }}>근무중</span>
                        ) : (
                          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, background: "#F1F5F9", color: "#475569", fontSize: 11, fontWeight: 700 }}>승인</span>
                        )}
                      </td>
                      <td style={TD}>
                        <button onClick={() => openEdit(r)} style={{ height: 30, padding: "0 14px", borderRadius: 6, border: "1px solid #D1D9E0", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#374151" }}>
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
        {rows.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#94A3B8", textAlign: "right" }}>
            총 {rows.length.toLocaleString()}명
          </div>
        )}
      </div>

      {/* ── 수정 모달 ── */}
      {selected && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 9999 }}
        >
          <div style={{ width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px rgba(2,6,23,0.28)" }}>

            {/* 모달 헤더 */}
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>기사 수정</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#94A3B8" }}>{selected.name ?? "-"} · {displayCarWithDelivery(selected)}</div>
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
                    <div style={fieldLabelStyle()}>이름</div>
                    <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>전화번호 (숫자만)</div>
                    <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} style={inputStyle()} placeholder="01012345678" />
                    <div style={{ marginTop: 4, fontSize: 11, color: "#94A3B8" }}>{formatKRPhone(f.phone)}</div>
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>생년월일</div>
                    <input type="date" value={f.birthdate} onChange={(e) => setF((p) => ({ ...p, birthdate: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>차량번호판</div>
                    <input value={f.vehicle_number} onChange={(e) => setF((p) => ({ ...p, vehicle_number: e.target.value }))} style={inputStyle()} placeholder="예: 경기12가3456" />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <span style={{ padding: "5px 12px", borderRadius: 20, background: "#F1F5F9", fontSize: 12, fontWeight: 700, color: "#475569" }}>나이 {age == null ? "-" : `${age}세`}</span>
                  <span style={{ padding: "5px 12px", borderRadius: 20, background: "#F1F5F9", fontSize: 12, fontWeight: 700, color: "#475569" }}>근속 {tenureText}</span>
                </div>
              </section>

              {/* 차량 / 배송 정보 */}
              <section style={sectionStyle()}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>차량 / 배송 정보</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={fieldLabelStyle()}>호차 (최대 4대)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    <input value={f.car_no_1} onChange={(e) => setF((p) => ({ ...p, car_no_1: e.target.value }))} style={inputStyle()} placeholder="차량 1" inputMode="numeric" />
                    <input value={f.car_no_2} onChange={(e) => setF((p) => ({ ...p, car_no_2: e.target.value }))} style={inputStyle()} placeholder="차량 2" inputMode="numeric" />
                    <input value={f.car_no_3} onChange={(e) => setF((p) => ({ ...p, car_no_3: e.target.value }))} style={inputStyle()} placeholder="차량 3" inputMode="numeric" />
                    <input value={f.car_no_4} onChange={(e) => setF((p) => ({ ...p, car_no_4: e.target.value }))} style={inputStyle()} placeholder="차량 4" inputMode="numeric" />
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#94A3B8" }}>정렬 후 표시: {displayCarNo(normalizeCarNoInput(f.car_no_1, f.car_no_2, f.car_no_3, f.car_no_4))}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={fieldLabelStyle()}>배송구분</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    {(["delivery_type", "delivery_type_2", "delivery_type_3", "delivery_type_4"] as const).map((key, i) => (
                      <select key={key} value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} style={inputStyle()}>
                        <option value="">차량{i + 1} -</option>
                        {DELIVERY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={fieldLabelStyle()}>차종</div>
                    <select value={f.vehicle_type} onChange={(e) => setF((p) => ({ ...p, vehicle_type: e.target.value }))} style={inputStyle()}>
                      <option value="">-</option>
                      {VEHICLE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>운수사</div>
                    <input value={f.carrier} onChange={(e) => setF((p) => ({ ...p, carrier: e.target.value }))} style={inputStyle()} placeholder="예: 동진 / 경산" />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>차고지</div>
                    <input value={f.garage} onChange={(e) => setF((p) => ({ ...p, garage: e.target.value }))} style={inputStyle()} placeholder="예: 화성센터" />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>하이패스</div>
                    <input value={f.hipass} onChange={(e) => setF((p) => ({ ...p, hipass: e.target.value }))} style={inputStyle()} placeholder="예: 카드번호 / 비고" />
                  </div>
                </div>
              </section>

              {/* 근무 / 승인 */}
              <section style={sectionStyle()}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", marginBottom: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>근무 / 승인</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={fieldLabelStyle()}>입사일</div>
                    <input type="date" value={f.join_date} onChange={(e) => setF((p) => ({ ...p, join_date: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>퇴사일</div>
                    <input type="date" value={f.leave_date} onChange={(e) => setF((p) => ({ ...p, leave_date: e.target.value }))} style={inputStyle()} />
                  </div>
                  <div>
                    <div style={fieldLabelStyle()}>승인 상태</div>
                    <select value={f.approval_status} onChange={(e) => setF((p) => ({ ...p, approval_status: e.target.value as "pending" | "approved" | "rejected" }))} style={inputStyle()}>
                      <option value="pending">확인대기</option>
                      <option value="approved">승인</option>
                      <option value="rejected">반려</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            {/* 모달 푸터 */}
            <div style={{ padding: "14px 22px", borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>승인된 기사만 근무중 상태가 표시됩니다.</div>
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
