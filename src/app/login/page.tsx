"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

// 한국 전화번호 -> E.164 (+82...)
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

// (구버전 호환) p_82...@phone.local
function phoneToEmail(e164: string) {
  const digits = e164.replace(/\D/g, "");
  return `p_${digits}@phone.local`;
}

function isInvalidCreds(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes("invalid login credentials") || msg.includes("invalid credentials");
}

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const e164 = useMemo(() => toE164KR(phone.trim()), [phone]);

  const onLogin = async () => {
    setMsg("");
    setBusy(true);

    try {
      if (!e164) throw new Error("전화번호 형식이 올바르지 않습니다. (예: 01012345678)");
      const pw = password.trim();
      if (pw.length < 6) throw new Error("비밀번호는 6자리 이상이어야 합니다.");

      // 1) ✅ phone 로그인 먼저
      let data: any = null;
      let err: any = null;

      const r1 = await supabase.auth.signInWithPassword({
        phone: e164,
        password: pw,
      });
      data = r1.data;
      err = r1.error;

      // 2) ✅ 구버전 email fallback
      if (err && isInvalidCreds(err)) {
        const email = phoneToEmail(e164);
        const r2 = await supabase.auth.signInWithPassword({
          email,
          password: pw,
        });
        data = r2.data;
        err = r2.error;
      }

      if (err) throw err;

      const uid = data?.session?.user?.id ?? data?.user?.id;
      if (!uid) throw new Error("로그인 세션 생성 실패");

      // ✅ 프로필 체크: 승인 + 관리자(메인 or 일반)
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

      const isMainAdmin = !!prof?.is_admin;
      const isAdminWorkPart = String(prof?.work_part ?? "").trim() === "관리자";

      // ✅ 여기만 바뀐 핵심 로직
      if (!isMainAdmin && !isAdminWorkPart) {
        await supabase.auth.signOut();
        setMsg("관리자만 로그인 가능합니다.");
        return;
      }

      router.replace("/admin");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
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
          />
          <input
            className="w-full rounded-xl border px-3 py-3 outline-none focus:ring"
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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