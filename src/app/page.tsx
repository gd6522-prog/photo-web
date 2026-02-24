"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<"checking" | "done">("checking");

  useEffect(() => {
    // ✅ React StrictMode(개발모드)에서 effect 2번 도는 것 방지
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const hasSession = !!data.session;
        router.replace(hasSession ? "/admin" : "/login");
      } catch {
        // 세션 확인 실패하면 안전하게 로그인으로
        router.replace("/login");
      } finally {
        setStatus("done");
      }
    })();
  }, [router]);

  // ✅ 잠깐 보이는 화면(플래시) 최소화용
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-sm text-zinc-500">
        {status === "checking" ? "접속 확인 중..." : "이동 중..."}
      </div>
    </div>
  );
}