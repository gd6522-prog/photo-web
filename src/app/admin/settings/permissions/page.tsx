"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { AccessLevel } from "@/lib/admin-access";
import { getAllItems } from "@/lib/menu-registry";

type DbRow = {
  menu_key: string;
  label: string | null;
  general_access: AccessLevel | null;
  updated_at: string | null;
};

type UiRow = {
  menu_key: string;
  label: string;
  general_access: AccessLevel;
};

const OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "full", label: "FULL (사용 가능)" },
  { value: "view", label: "VIEW (읽기 전용)" },
  { value: "hidden", label: "HIDDEN (안 보임 + 접근 차단)" },
];

function keysToInList(keys: string[]) {
  // PostgREST in() 포맷: ("a","b","c")
  const quoted = keys.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(",");
  return `(${quoted})`;
}

export default function PermissionsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rows, setRows] = useState<UiRow[]>([]);
  const [msg, setMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  const registry = useMemo(() => getAllItems(), []);
  const registryKeys = useMemo(() => registry.map((m) => m.key), [registry]);

  const tips = useMemo(
    () => [
      "FULL: 일반관리자 메뉴 보임 + 접근 가능",
      "VIEW: 메뉴 보임 + 접근 가능 (※ 각 페이지에서 저장/작성 버튼을 끄는 추가 작업이 필요)",
      "HIDDEN: 메뉴 숨김 + 주소로 접근도 차단",
      "※ 이 화면은 '레지스트리(menu-registry.ts)' 기준으로만 목록을 보여줍니다. DB에 남은 찌꺼기 키는 자동 정리됩니다.",
    ],
    []
  );

  const assertMainAdmin = async () => {
    const { data: s, error: sErr } = await supabase.auth.getSession();
    if (sErr) throw sErr;

    const uid = s.session?.user?.id;
    if (!uid) {
      router.replace("/login");
      return { ok: false as const };
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("is_admin,approval_status")
      .eq("id", uid)
      .single();

    if (pErr) throw pErr;

    if (!prof || prof.approval_status !== "approved" || !prof.is_admin) {
      router.replace("/admin");
      return { ok: false as const };
    }

    return { ok: true as const };
  };

  const buildUiRows = (db: DbRow[]) => {
    const map: Record<string, AccessLevel> = {};
    for (const r of db ?? []) {
      if (!r?.menu_key) continue;
      map[r.menu_key] = (r.general_access ?? "full") as AccessLevel;
    }

    // ✅ 레지스트리 기준으로만 UI를 만듦 (DB 찌꺼기 키는 표시 안 됨)
    const ui: UiRow[] = registry.map((m) => ({
      menu_key: m.key,
      label: m.label,
      general_access: (map[m.key] ?? "full") as AccessLevel,
    }));

    return ui;
  };

  const pruneDb = async () => {
    // ✅ 레지스트리에 없는 row 삭제 (찔끔 남는 중복/구버전 키 정리)
    const inList = keysToInList(registryKeys);
    const { error } = await supabase
      .from("admin_menu_permissions")
      .delete()
      .not("menu_key", "in", inList);

    if (error) throw error;
  };

  const syncRegistryToDb = async () => {
    // ✅ 레지스트리 키는 upsert로 보장(기본 general_access=full)
    const rows = registry.map((m) => ({
      menu_key: m.key,
      label: m.label,
      general_access: "full" as AccessLevel,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("admin_menu_permissions")
      .upsert(rows, { onConflict: "menu_key" });

    if (error) throw error;
  };

  const load = async () => {
    setMsg("");
    setLoading(true);
    try {
      const ok = await assertMainAdmin();
      if (!ok.ok) return;

      // 1) DB에서 현재 권한 읽기
      const { data, error } = await supabase
        .from("admin_menu_permissions")
        .select("menu_key,label,general_access,updated_at")
        .order("menu_key", { ascending: true });

      if (error) throw error;

      // 2) UI는 레지스트리 기준으로만 생성
      setRows(buildUiRows((data as DbRow[]) ?? []));

      // 3) (자동) 찌꺼기 키 정리
      //    - 권한 화면 들어올 때마다 한번 정리되도록
      await pruneDb();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = async (menu_key: string, next: AccessLevel) => {
    setMsg("");
    setSavingKey(menu_key);
    try {
      // ✅ 없을 수도 있으니 update가 아니라 upsert로 처리
      const found = registry.find((x) => x.key === menu_key);
      const label = found?.label ?? menu_key;

      const { error } = await supabase
        .from("admin_menu_permissions")
        .upsert(
          {
            menu_key,
            label,
            general_access: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "menu_key" }
        );

      if (error) throw error;

      setRows((prev) => prev.map((r) => (r.menu_key === menu_key ? { ...r, general_access: next } : r)));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSavingKey(null);
    }
  };

  const onSyncPrune = async () => {
    setMsg("");
    setSyncing(true);
    try {
      const ok = await assertMainAdmin();
      if (!ok.ok) return;

      // 1) 레지스트리 upsert(누락키 생성, label 최신화)
      await syncRegistryToDb();
      // 2) 레지스트리에 없는 찌꺼기 키 삭제
      await pruneDb();

      // 3) 다시 로드
      const { data, error } = await supabase
        .from("admin_menu_permissions")
        .select("menu_key,label,general_access,updated_at")
        .order("menu_key", { ascending: true });

      if (error) throw error;
      setRows(buildUiRows((data as DbRow[]) ?? []));

      setMsg("동기화/정리 완료");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 0, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 18 }}>일반관리자 메뉴 권한 설정</div>
          <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>
            메인관리자만 변경 가능합니다. 기본값은 전부 FULL 입니다.
          </div>
        </div>

        <button
          onClick={onSyncPrune}
          disabled={loading || syncing}
          style={{
            height: 38,
            padding: "0 12px",
            borderRadius: 0,
            border: "1px solid #111827",
            background: syncing ? "#CBD5E1" : "#111827",
            color: "white",
            fontWeight: 950,
            cursor: loading || syncing ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {syncing ? "동기화 중..." : "메뉴 동기화/정리"}
        </button>
      </div>

      <div style={{ marginTop: 10, color: "#374151", fontSize: 12, lineHeight: 1.6 }}>
        {tips.map((t) => (
          <div key={t}>• {t}</div>
        ))}
      </div>

      {msg && <div style={{ marginTop: 10, color: msg.includes("완료") ? "#065F46" : "#B91C1C", fontWeight: 900 }}>{msg}</div>}

      {loading ? (
        <div style={{ marginTop: 16, color: "#6B7280", fontWeight: 800 }}>불러오는 중...</div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 10, fontWeight: 950, fontSize: 13, color: "#111827" }}>
            <div>메뉴</div>
            <div>일반관리자 권한</div>
          </div>

          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {rows.map((r) => (
              <div
                key={r.menu_key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr",
                  gap: 10,
                  padding: 12,
                  border: "1px solid #E5E7EB",
                  borderRadius: 0,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900, color: "#111827" }}>{r.label}</div>

                <select
                  value={r.general_access}
                  onChange={(e) => onChange(r.menu_key, e.target.value as AccessLevel)}
                  disabled={savingKey === r.menu_key}
                  style={{
                    height: 38,
                    borderRadius: 0,
                    border: "1px solid #D1D5DB",
                    padding: "0 10px",
                    fontWeight: 900,
                    background: "white",
                  }}
                >
                  {OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}