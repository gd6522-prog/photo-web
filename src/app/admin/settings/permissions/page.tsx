"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { AccessLevel } from "@/lib/admin-access";

type Row = {
  menu_key: string;
  label: string;
  general_access: AccessLevel;
  updated_at: string;
};

const OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "full", label: "FULL (사용 가능)" },
  { value: "view", label: "VIEW (읽기 전용)" },
  { value: "hidden", label: "HIDDEN (안 보임 + 접근 차단)" },
];

export default function PermissionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");
    setLoading(true);
    try {
      // 메인관리자 확인(권한 없으면 /admin으로)
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin,approval_status")
        .eq("id", uid)
        .single();

      if (!prof || prof.approval_status !== "approved" || !prof.is_admin) {
        router.replace("/admin");
        return;
      }

      const { data, error } = await supabase
        .from("admin_menu_permissions")
        .select("menu_key,label,general_access,updated_at")
        .order("menu_key", { ascending: true });

      if (error) throw error;
      setRows((data as Row[]) ?? []);
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
      const { error } = await supabase
        .from("admin_menu_permissions")
        .update({ general_access: next })
        .eq("menu_key", menu_key);
      if (error) throw error;

      setRows((prev) => prev.map((r) => (r.menu_key === menu_key ? { ...r, general_access: next } : r)));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSavingKey(null);
    }
  };

  const tips = useMemo(
    () => [
      "FULL: 일반관리자 메뉴 보임 + 접근 가능",
      "VIEW: 메뉴 보임 + 접근 가능 (※ 각 페이지에서 저장/작성 버튼을 끄는 추가 작업이 필요)",
      "HIDDEN: 메뉴 숨김 + 주소로 접근도 차단",
    ],
    []
  );

  return (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 }}>
      <div style={{ fontWeight: 950, fontSize: 18 }}>일반관리자 메뉴 권한 설정</div>
      <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>
        메인관리자만 변경 가능합니다. 기본값은 전부 FULL 입니다.
      </div>

      <div style={{ marginTop: 10, color: "#374151", fontSize: 12, lineHeight: 1.6 }}>
        {tips.map((t) => (
          <div key={t}>• {t}</div>
        ))}
      </div>

      {msg && <div style={{ marginTop: 10, color: "#B91C1C", fontWeight: 800 }}>{msg}</div>}

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
                  borderRadius: 12,
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
                    borderRadius: 10,
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