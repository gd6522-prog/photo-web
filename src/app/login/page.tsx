"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";

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

function isInvalidCreds(err: unknown) {
  const msg = String((err as { message?: string } | null)?.message ?? "").toLowerCase();
  return msg.includes("invalid login credentials") || msg.includes("invalid credentials");
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
    return "서버 권한정책(RLS) 설정 오류로 로그인 처리가 막혔습니다. 관리자에게 정책 수정이 필요합니다.";
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
  if (lower.includes("row-level security") || lower.includes("rls")) {
    return "권한 정책(RLS) 때문에 접근이 거부되었습니다. 관리자에게 문의해 주세요.";
  }
  return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const e164 = useMemo(() => toE164KR(phone.trim()), [phone]);

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

      const r1 = await supabase.auth.signInWithPassword({ phone: e164, password: pw });
      data = r1.data as { session: unknown; user: { id?: string } | null } | null;
      err = r1.error;

      if (err && isInvalidCreds(err)) {
        const email = phoneToEmail(e164);
        const r2 = await supabase.auth.signInWithPassword({ email, password: pw });
        data = r2.data as { session: unknown; user: { id?: string } | null } | null;
        err = r2.error;
      }

      if (err) throw err;

      const session = (await ensureSessionReady()) ?? (data as { session?: unknown } | null)?.session ?? null;
      const uid = (session as { user?: { id?: string } } | null)?.user?.id ?? data?.user?.id;
      if (!uid) throw new Error("로그인 세션 생성 실패");

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("approval_status,is_admin,work_part")
        .eq("id", uid)
        .single();
      if (pErr) throw pErr;

      if (prof?.approval_status !== "approved") {
        await supabase.auth.signOut();
        setMsg("승인 대기 상태입니다. 관리자 승인 후 로그인할 수 있습니다.");
        return;
      }

      const email = (session as { user?: { email?: string | null } } | null)?.user?.email ?? "";
      const isMainAdmin = isMainAdminIdentity(uid, email) || !!prof?.is_admin;
      const isAdminWorkPart = isGeneralAdminWorkPart(prof?.work_part);

      if (!isMainAdmin && !isAdminWorkPart) {
        await supabase.auth.signOut();
        setMsg(`관리자만 로그인 가능합니다. (작업파트: ${String(prof?.work_part ?? "-")})`);
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch (e: unknown) {
      setMsg(toKoreanErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-xl font-black text-zinc-900">관리자 로그인</div>
        <div className="mt-1 text-sm text-zinc-500">전화번호 + 비밀번호로 로그인합니다.</div>

        <div className="mt-5 grid gap-3">
          <input
            className="w-full rounded-xl border px-3 py-3 outline-none focus:ring"
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
            className="w-full rounded-xl border px-3 py-3 outline-none focus:ring"
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onLogin();
            }}
          />

          <button
            className="w-full rounded-xl bg-black py-3 font-bold text-white disabled:opacity-60"
            onClick={onLogin}
            disabled={busy || !phone || !password}
          >
            {busy ? "로그인 중..." : "로그인"}
          </button>

          {msg && <div className="text-sm text-red-600">{msg}</div>}

          <div className="text-xs text-zinc-400">로그인 성공 후 관리자면 /admin 으로 이동합니다.</div>
        </div>
      </div>
    </div>
  );
}
