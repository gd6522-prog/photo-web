"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Props = { type: "regular" | "visitor" };

const CAR_NUMBER_RE = /^[0-9]{2,3}[가-힣][0-9]{4}$/;
const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 800,
  color: "#9fb3c7",
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  height: 52,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#e6eef7",
  fontSize: 16,
  fontWeight: 600,
  outline: "none",
  boxSizing: "border-box",
};

export default function RequestForm({ type }: Props) {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [immediateEntry, setImmediateEntry] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [done, setDone] = useState(false);
  const [doneGateInfo, setDoneGateInfo] = useState<{ gateOpened: boolean | null; gateError?: string }>({
    gateOpened: null,
  });

  const today = useMemo(() => todayKST(), []);

  const validate = (): string | null => {
    if (!company.trim()) return "소속(회사명)을 입력해 주세요.";
    if (!name.trim()) return "이름을 입력해 주세요.";
    if (!CAR_NUMBER_RE.test(carNumber.trim())) return "차량번호 형식이 올바르지 않습니다. (예: 12가3456)";
    if (!PHONE_RE.test(phone.trim())) return "연락처 형식이 올바르지 않습니다. (예: 010-0000-0000)";
    if (type === "visitor") {
      if (!visitDate) return "방문 날짜를 선택해 주세요.";
      if (visitDate < today) return "방문 날짜는 오늘 이후로 선택해 주세요.";
      if (immediateEntry === null) return "바로입차 여부를 선택해 주세요.";
    }
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrMsg("");
    const v = validate();
    if (v) {
      setErrMsg(v);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/parking/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          company: company.trim(),
          name: name.trim(),
          car_number: carNumber.trim(),
          phone: phone.trim(),
          visit_date: type === "visitor" ? visitDate : undefined,
          visit_purpose: type === "visitor" ? visitPurpose.trim() : undefined,
          immediate_entry: type === "visitor" ? immediateEntry : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        gateOpened?: boolean | null;
        gateError?: string;
      };
      if (!res.ok || !data.ok) {
        setErrMsg(data.message || "신청 처리 중 오류가 발생했습니다.");
        return;
      }
      setDoneGateInfo({ gateOpened: data.gateOpened ?? null, gateError: data.gateError });
      setDone(true);
    } catch {
      setErrMsg("네트워크 오류입니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#ffffff", marginBottom: 12 }}>
          {type === "visitor" ? "방문 신청이 등록되었습니다" : "신청이 접수되었습니다"}
        </div>
        <div style={{ fontSize: 15, color: "#9fb3c7", lineHeight: 1.7, maxWidth: 360 }}>
          {type === "visitor" ? (
            doneGateInfo.gateOpened === true ? (
              <>
                입구 게이트가 열립니다.
                <br />
                바로 입차해 주세요.
              </>
            ) : doneGateInfo.gateOpened === false ? (
              <span style={{ color: "#fecaca" }}>
                신청은 등록됐지만 게이트 자동개방에 실패했습니다.
                <br />
                관리원에게 문의해 주세요.
                {doneGateInfo.gateError ? <><br /><span style={{ fontSize: 12, opacity: 0.85 }}>({doneGateInfo.gateError})</span></> : null}
              </span>
            ) : (
              <>
                방문일 다음날까지 입차 가능합니다.
                <br />
                차량번호로 자동 인식됩니다.
              </>
            )
          ) : (
            <>
              관리자 승인 후 입차 가능합니다.
              <br />
              결과는 추후 안내됩니다.
            </>
          )}
        </div>
        <Link
          href="/parking"
          style={{
            marginTop: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 48,
            padding: "0 24px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            color: "#e6eef7",
            fontWeight: 800,
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          처음으로
        </Link>
      </div>
    );
  }

  const title = type === "regular" ? "정기 신청" : "방문 신청";

  return (
    <div style={{ minHeight: "100vh", padding: "20px 18px 40px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <Link
          href="/parking"
          style={{
            color: "#9fb3c7",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← 뒤로
        </Link>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#64748b" }}>한익스프레스 화성센터</div>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 900, color: "#ffffff", margin: "4px 0 22px" }}>{title}</h1>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={fieldLabel}>소속 (회사명) *</label>
          <input
            style={fieldInput}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="예: 한익스프레스"
            maxLength={80}
            autoComplete="organization"
          />
        </div>

        <div>
          <label style={fieldLabel}>이름 *</label>
          <input
            style={fieldInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            maxLength={40}
            autoComplete="name"
          />
        </div>

        <div>
          <label style={fieldLabel}>차량번호 *</label>
          <input
            style={fieldInput}
            value={carNumber}
            onChange={(e) => setCarNumber(e.target.value.replace(/\s+/g, ""))}
            placeholder="예: 12가3456"
            maxLength={20}
            inputMode="text"
          />
        </div>

        <div>
          <label style={fieldLabel}>연락처 *</label>
          <input
            style={fieldInput}
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-0000-0000"
            maxLength={13}
            inputMode="numeric"
            autoComplete="tel"
          />
        </div>

        {type === "visitor" ? (
          <>
            <div>
              <label style={fieldLabel}>방문 날짜 *</label>
              <input
                type="date"
                style={fieldInput}
                value={visitDate}
                min={today}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
            <div>
              <label style={fieldLabel}>방문 목적 (선택)</label>
              <input
                style={fieldInput}
                value={visitPurpose}
                onChange={(e) => setVisitPurpose(e.target.value)}
                placeholder="예: 거래처 미팅"
                maxLength={200}
              />
            </div>
            <div>
              <label style={fieldLabel}>바로입차 *</label>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { v: true, label: "예 (지금 입차)" },
                  { v: false, label: "아니오" },
                ].map((opt) => {
                  const active = immediateEntry === opt.v;
                  return (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setImmediateEntry(opt.v)}
                      style={{
                        flex: 1,
                        height: 52,
                        borderRadius: 12,
                        border: active
                          ? "2px solid #14b8a6"
                          : "1px solid rgba(255,255,255,0.10)",
                        background: active ? "rgba(20,184,166,0.18)" : "rgba(255,255,255,0.04)",
                        color: active ? "#5eead4" : "#e6eef7",
                        fontSize: 15,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                예 선택 시 신청과 동시에 입구 게이트가 자동으로 열립니다.
              </div>
            </div>
          </>
        ) : null}

        {errMsg ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.35)",
              color: "#fecaca",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {errMsg}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 8,
            height: 56,
            borderRadius: 14,
            border: "none",
            background:
              type === "regular"
                ? "linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)"
                : "linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 18,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
            boxShadow: "0 14px 30px rgba(15,118,110,0.35)",
          }}
        >
          {busy ? "신청 중..." : "신청하기"}
        </button>
      </form>
    </div>
  );
}
