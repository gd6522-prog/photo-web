"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function toE164KR(raw: string): string | null {
  const s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) {
    if (!/^\+\d{8,15}$/.test(s)) return null;
    return s;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  if (!digits.startsWith("0")) return null;
  return `+82${digits.slice(1)}`;
}

function phoneToEmail(e164: string) {
  const digits = e164.replace(/\D/g, "");
  return `p_${digits}@phone.local`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function ensureSessionReady(retry = 6, delayMs = 120) {
  for (let i = 0; i < retry; i++) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user?.id) return data.session;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

function toKoreanErrorMessage(e: unknown): string {
  const raw = String((e as { message?: string } | null)?.message ?? e ?? "");
  const lower = raw.toLowerCase();

  if (lower.includes("infinite recursion detected in policy") && lower.includes('"profiles"')) {
    return '서버 권한정책(RLS) 설정 오류로 로그인 처리가 막혔습니다. 관리자에게 정책 수정이 필요합니다.';
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
    return "전화번호 또는 비밀번호가 올바르지 않습니다.";
  }
  if (lower.includes("email not confirmed")) {
    return "이메일 인증이 필요합니다.";
  }
  if (lower.includes("phone not confirmed") || lower.includes("sms") || lower.includes("otp")) {
    return "전화번호 인증 상태를 확인해 주세요.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return "네트워크 오류입니다. 인터넷 연결을 확인해 주세요.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "로그인 요청이 오래 걸려 중단되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (lower.includes("row-level security") || lower.includes("rls")) {
    return "권한 정책(RLS) 때문에 접근이 거부되었습니다. 관리자에게 문의해 주세요.";
  }
  return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

async function attemptPasswordLogin(e164: string, password: string) {
  const email = phoneToEmail(e164);

  // 이메일/전화 방식을 병렬로 시도해 먼저 성공한 결과를 반환
  const emailPromise = withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    10000,
    "Email login request timed out"
  );
  const phonePromise = withTimeout(
    supabase.auth.signInWithPassword({ phone: e164, password }),
    10000,
    "Phone login request timed out"
  );

  const [emailResult, phoneResult] = await Promise.allSettled([emailPromise, phonePromise]);

  const emailValue = emailResult.status === "fulfilled" ? emailResult.value : null;
  const phoneValue = phoneResult.status === "fulfilled" ? phoneResult.value : null;

  // 성공한 결과 우선 반환
  if (emailValue && !emailValue.error) return emailValue;
  if (phoneValue && !phoneValue.error) return phoneValue;

  // 둘 다 실패 — phone 에러 메시지가 더 구체적이므로 우선 반환
  if (phoneValue) return phoneValue;
  if (emailValue) return emailValue;
  throw new Error("로그인 요청에 실패했습니다. 네트워크를 확인해 주세요.");
}

function toKoreanResetErrorMessage(e: unknown): string {
  const raw = String((e as { message?: string } | null)?.message ?? e ?? "");
  const lower = raw.toLowerCase();

  if (!raw.trim()) return "비밀번호 재설정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  if (lower.includes("sms") && lower.includes("provider")) {
    return "SMS 인증 설정이 비활성화되어 있습니다. Supabase Auth Phone/SMS Provider를 먼저 설정해 주세요.";
  }
  if (lower.includes("unsupported") && lower.includes("phone")) {
    return "전화번호 OTP를 지원하지 않는 설정입니다. 인증 설정을 확인해 주세요.";
  }
  if (lower.includes("invalid") && lower.includes("otp")) {
    return "인증번호가 올바르지 않습니다. 다시 확인해 주세요.";
  }
  if (lower.includes("user not found") || lower.includes("not found")) {
    return "가입된 전화번호를 찾을 수 없습니다.";
  }
  if (lower.includes("expired") && lower.includes("otp")) {
    return "인증번호가 만료되었습니다. 인증번호를 다시 발송해 주세요.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "네트워크 오류입니다. 인터넷 연결을 확인해 주세요.";
  }
  if (lower.includes("row-level security") || lower.includes("rls")) {
    return "권한 정책(RLS)으로 요청이 차단되었습니다. 관리자에게 문의해 주세요.";
  }
  return `비밀번호 재설정 오류: ${raw}`;
}

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [showReset, setShowReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtp, setResetOtp] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");

  const e164 = useMemo(() => toE164KR(phone.trim()), [phone]);
  const resetE164 = useMemo(() => toE164KR(resetPhone.trim()), [resetPhone]);

  const onLogin = async () => {
    if (busy) return;
    setMsg("");
    setBusy(true);

    try {
      if (!e164) throw new Error("전화번호 형식이 올바르지 않습니다. (예: 01012345678)");
      const pw = password.trim();
      if (pw.length < 6) throw new Error("비밀번호는 6자리 이상이어야 합니다.");

      let data: { session: unknown; user: { id?: string } | null } | null = null;
      let err: unknown = null;

      const result = await attemptPasswordLogin(e164, pw);
      data = result.data as { session: unknown; user: { id?: string } | null } | null;
      err = result.error;

      if (err) throw err;

      const session =
        (await withTimeout(ensureSessionReady(), 5000, "Session readiness timed out")) ??
        (data as { session?: unknown } | null)?.session ??
        null;
      const uid = (session as { user?: { id?: string } } | null)?.user?.id ?? data?.user?.id;
      if (!uid) throw new Error("로그인 세션 생성 실패");

      router.replace("/admin");
    } catch (e: unknown) {
      setMsg(toKoreanErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onSendResetOtp = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    setResetMsg("");
    try {
      if (!resetE164) throw new Error("전화번호 형식이 올바르지 않습니다. (예: 01012345678)");
      const { error } = await supabase.auth.signInWithOtp({
        phone: resetE164,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setResetOtpSent(true);
      setResetMsg("인증번호를 발송했습니다.");
    } catch (e: unknown) {
      setResetMsg(toKoreanResetErrorMessage(e));
    } finally {
      setResetBusy(false);
    }
  };

  const onResetPassword = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    setResetMsg("");
    try {
      if (!resetE164) throw new Error("전화번호 형식이 올바르지 않습니다.");
      if (!resetOtpSent) throw new Error("먼저 인증번호를 발송해 주세요.");
      if (resetOtp.trim().length < 4) throw new Error("인증번호를 입력해 주세요.");
      if (resetPassword.trim().length < 6) throw new Error("비밀번호는 6자리 이상이어야 합니다.");
      if (resetPassword.trim() !== resetPassword2.trim()) throw new Error("비밀번호 확인이 일치하지 않습니다.");

      const { error: otpErr } = await supabase.auth.verifyOtp({
        phone: resetE164,
        token: resetOtp.trim(),
        type: "sms",
      });
      if (otpErr) throw otpErr;

      const { error: upErr } = await supabase.auth.updateUser({
        password: resetPassword.trim(),
      });
      if (upErr) throw upErr;

      await supabase.auth.signOut();
      setShowReset(false);
      setResetOtpSent(false);
      setResetOtp("");
      setResetPassword("");
      setResetPassword2("");
      setResetMsg("");
      setMsg("비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.");
    } catch (e: unknown) {
      setResetMsg(toKoreanResetErrorMessage(e));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#ecf2f7]">
      <div className="pointer-events-none absolute -top-28 -left-24 h-80 w-80 rounded-full bg-[#0f766e]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-[#164e63]/20 blur-3xl" />

      <div className="relative min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded border border-[#b6c8d7] bg-white/95 p-7 shadow-[0_24px_60px_rgba(2,32,46,0.18)]">
          <div className="mb-5">
            <div className="text-2xl font-black tracking-tight text-[#0b2536]">관리자 로그인</div>
            <div className="mt-1 text-sm font-medium text-[#557186]">전화번호와 비밀번호로 로그인합니다.</div>
          </div>

          <div className="grid gap-3">
            <input
              className="h-12 w-full rounded border border-[#b7c8d7] px-4 text-[15px] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              placeholder="전화번호 (예: 01012345678)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoCapitalize="none"
              autoCorrect="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") onLogin();
              }}
            />

            <input
              className="h-12 w-full rounded border border-[#b7c8d7] px-4 text-[15px] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              placeholder="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onLogin();
              }}
            />

            <button
              className="h-12 w-full rounded bg-[#103b53] text-[16px] font-black text-white transition hover:bg-[#0c2f43] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onLogin}
              disabled={busy || !phone || !password}
            >
              {busy ? "로그인 중..." : "로그인"}
            </button>

            {msg ? <div className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{msg}</div> : null}

            <button
              type="button"
              className="mt-1 w-fit text-sm font-black text-[#0f3c8e] underline underline-offset-2"
              onClick={() => {
                setShowReset((p) => !p);
                setResetMsg("");
              }}
            >
              비밀번호 재설정
            </button>

            {showReset ? (
              <div className="rounded border border-[#c9d7e2] bg-[#f7fbff] p-3">
                <div className="mb-2 text-sm font-black text-[#0f2433]">비밀번호 재설정</div>
                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <input
                      className="h-11 flex-1 rounded border border-[#b7c8d7] px-3 text-[15px] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      placeholder="전화번호 (예: 01012345678)"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      inputMode="tel"
                      disabled={resetBusy}
                    />
                    <button
                      type="button"
                      className="h-11 rounded bg-[#0f172a] px-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-50"
                      onClick={onSendResetOtp}
                      disabled={resetBusy || !resetPhone}
                    >
                      {resetBusy ? "요청 중..." : resetOtpSent ? "재발송" : "인증번호 발송"}
                    </button>
                  </div>

                  <input
                    className="h-11 rounded border border-[#b7c8d7] px-3 text-[15px] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                    placeholder="인증번호"
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value)}
                    disabled={resetBusy || !resetOtpSent}
                  />
                  <input
                    className="h-11 rounded border border-[#b7c8d7] px-3 text-[15px] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                    type="password"
                    placeholder="새 비밀번호 (6자리 이상)"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    disabled={resetBusy || !resetOtpSent}
                  />
                  <input
                    className="h-11 rounded border border-[#b7c8d7] px-3 text-[15px] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                    type="password"
                    placeholder="새 비밀번호 확인"
                    value={resetPassword2}
                    onChange={(e) => setResetPassword2(e.target.value)}
                    disabled={resetBusy || !resetOtpSent}
                  />
                  <button
                    type="button"
                    className="h-11 w-full rounded bg-[#334155] text-sm font-black text-white transition hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onResetPassword}
                    disabled={resetBusy || !resetOtpSent || !resetOtp || !resetPassword || !resetPassword2}
                  >
                    {resetBusy ? "처리 중..." : "비밀번호 변경"}
                  </button>
                  {resetMsg ? <div className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{resetMsg}</div> : null}
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </div>
    </div>
  );
}
