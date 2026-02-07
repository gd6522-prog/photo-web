"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onLogin = async () => {
    setMsg("");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // 관리자 여부 확인 (profiles.is_admin)
      const uid = data.session?.user.id;
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", uid)
        .maybeSingle();

      if (pErr) throw pErr;

      if (!prof?.is_admin) {
        await supabase.auth.signOut();
        setMsg("관리자 계정만 로그인 가능합니다.");
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
        <div className="mt-1 text-sm text-zinc-500">Supabase 계정으로 로그인합니다.</div>

        <div className="mt-5 grid gap-3">
          <input
            className="w-full rounded-xl border px-3 py-3 outline-none focus:ring"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            disabled={busy || !email || !password}
          >
            {busy ? "로그인 중..." : "로그인"}
          </button>

          {msg && <div className="text-sm text-red-600">{msg}</div>}

          <div className="text-xs text-zinc-400">
            로그인 성공 후 관리자면 /admin 으로 이동합니다.
          </div>
        </div>
      </div>
    </div>
  );
}
