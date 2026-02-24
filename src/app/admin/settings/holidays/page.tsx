"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function HolidaySyncPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const year = new Date().getFullYear();
      // 올해~내년 동기화
      const { data, error } = await supabase.functions.invoke("sync-holidays", {
        body: { yearFrom: year, yearTo: year + 1 },
      });
      if (error) throw error;
      setMsg(`완료: ${data?.upserted ?? 0}건 (범위 ${data?.fromY}~${data?.toY})`);
    } catch (e: any) {
      setMsg(`실패: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>공휴일 동기화</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>
        공공데이터포털(한국천문연구원 특일정보) 공휴일 데이터를 DB(holidays)에 자동 저장합니다.
      </p>

      <button
        onClick={run}
        disabled={busy}
        style={{
          marginTop: 12,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "white",
          fontWeight: 900,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "동기화 중..." : "올해~내년 공휴일 동기화"}
      </button>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(0,0,0,0.04)",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}