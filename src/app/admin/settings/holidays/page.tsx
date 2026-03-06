"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";

type SyncResult = {
  ok?: boolean;
  message?: string;
  data?: {
    fromY?: number;
    toY?: number;
    inserted?: number;
    updated?: number;
    upserted?: number;
    skipped?: number;
  };
};

export default function HolidaySyncPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const run = async () => {
    if (busy) return;

    setBusy(true);
    setMsg("");

    try {
      const year = new Date().getFullYear();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("로그인 세션이 없습니다. 다시 로그인해 주세요.");

      const res = await fetch("/api/admin/sync-holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          yearFrom: year,
          yearTo: year + 1,
        }),
      });

      let json: SyncResult = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || `HTTP ${res.status}`);
      }

      const data = json.data || {};
      const fromY = data.fromY ?? year;
      const toY = data.toY ?? year + 1;
      const inserted = data.inserted ?? 0;
      const updated = data.updated ?? 0;
      const upserted = data.upserted ?? inserted + updated;
      const skipped = data.skipped ?? 0;

      setMsg(
        [
          "✅ 공휴일 동기화 완료",
          `- 범위: ${fromY} ~ ${toY}`,
          `- 반영건수: ${upserted}건`,
          `- 신규: ${inserted}건`,
          `- 수정: ${updated}건`,
          `- 제외: ${skipped}건`,
        ].join("\n")
      );
    } catch (e: any) {
      setMsg(`❌ 실패: ${e?.message ?? String(e)}`);
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
          background: busy ? "rgba(0,0,0,0.04)" : "white",
          fontWeight: 900,
          cursor: busy ? "not-allowed" : "pointer",
          minWidth: 220,
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
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.6,
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
