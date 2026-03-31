"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { AccessLevel } from "@/lib/admin-access";
import { getAllItems, MENU_REGISTRY } from "@/lib/menu-registry";

type DbRow = {
  menu_key: string;
  label: string | null;
  general_access: AccessLevel | null;
  company_access: AccessLevel | null;
  updated_at: string | null;
};

type UiRow = {
  menu_key: string;
  label: string;
  general_access: AccessLevel;
  company_access: AccessLevel;
  parent?: string;
  mainOnly?: boolean;
};

type SectionGroup = {
  parent: UiRow;
  children: UiRow[];
};

const ACCESS_CONFIG: Record<AccessLevel, { label: string; short: string; bg: string; color: string; border: string }> = {
  full:   { label: "사용 가능",        short: "FULL",  bg: "#DCFCE7", color: "#166534", border: "#86EFAC" },
  view:   { label: "읽기 전용",        short: "VIEW",  bg: "#DBEAFE", color: "#1E40AF", border: "#93C5FD" },
  hidden: { label: "숨김 + 접근 차단", short: "숨김",  bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  edit:   { label: "편집",            short: "EDIT",  bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
};

const OPTIONS: AccessLevel[] = ["full", "view", "hidden"];

function keysToInList(keys: string[]) {
  const quoted = keys.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(",");
  return `(${quoted})`;
}

function AccessBadge({ value }: { value: AccessLevel }) {
  const cfg = ACCESS_CONFIG[value] ?? ACCESS_CONFIG.hidden;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 99,
      fontSize: 11, fontWeight: 900,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.short}
    </span>
  );
}

export default function PermissionsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rows, setRows] = useState<UiRow[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const registry = useMemo(() => getAllItems(), []);
  const registryKeys = useMemo(() => registry.map((m) => m.key), [registry]);

  const buildUiRows = (db: DbRow[]): UiRow[] => {
    const gMap: Record<string, AccessLevel> = {};
    const cMap: Record<string, AccessLevel> = {};
    for (const r of db ?? []) {
      if (r?.menu_key) {
        gMap[r.menu_key] = (r.general_access ?? "full") as AccessLevel;
        cMap[r.menu_key] = (r.company_access ?? "full") as AccessLevel;
      }
    }
    return registry.map((m) => ({
      menu_key: m.key,
      label: m.label,
      general_access: (gMap[m.key] ?? "full") as AccessLevel,
      company_access: (cMap[m.key] ?? "full") as AccessLevel,
      parent: m.parent,
      mainOnly: m.mainOnly,
    }));
  };

  const pruneDb = async () => {
    const { error } = await supabase
      .from("admin_menu_permissions")
      .delete()
      .not("menu_key", "in", keysToInList(registryKeys));
    if (error) throw error;
  };

  const insertMissingKeys = async (dbKeys: Set<string>) => {
    const missing = registry.filter((m) => !dbKeys.has(m.key));
    if (missing.length === 0) return;
    const { error } = await supabase.from("admin_menu_permissions").insert(
      missing.map((m) => ({
        menu_key: m.key,
        label: m.label,
        general_access: "full" as AccessLevel,
        company_access: "full" as AccessLevel,
        updated_at: new Date().toISOString(),
      }))
    );
    if (error && !error.message.includes("duplicate")) throw error;
  };

  const assertMainAdmin = async () => {
    const { data: s, error: sErr } = await supabase.auth.getSession();
    if (sErr) throw sErr;
    const uid = s.session?.user?.id;
    if (!uid) { router.replace("/login"); return { ok: false as const }; }
    const { data: prof, error: pErr } = await supabase.from("profiles").select("is_admin,approval_status").eq("id", uid).single();
    if (pErr) throw pErr;
    if (!prof || prof.approval_status !== "approved" || !prof.is_admin) { router.replace("/admin"); return { ok: false as const }; }
    return { ok: true as const };
  };

  const load = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const ok = await assertMainAdmin();
      if (!ok.ok) return;

      const { data, error } = await supabase
        .from("admin_menu_permissions")
        .select("menu_key,label,general_access,company_access,updated_at");
      if (error) throw error;

      const dbRows = (data as DbRow[]) ?? [];
      const dbKeys = new Set(dbRows.map((r) => r.menu_key));

      await Promise.all([insertMissingKeys(dbKeys), pruneDb()]);

      const { data: fresh, error: e2 } = await supabase
        .from("admin_menu_permissions")
        .select("menu_key,label,general_access,company_access,updated_at");
      if (e2) throw e2;

      setRows(buildUiRows((fresh as DbRow[]) ?? []));
    } catch (e: unknown) {
      setMsg({ text: (e as Error)?.message ?? String(e), ok: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = async (menu_key: string, field: "general_access" | "company_access", next: AccessLevel) => {
    setMsg(null);
    setSavingKey(`${menu_key}__${field}`);
    try {
      // 해당 키의 자식들 수집 (상위 메뉴 변경 시 하위도 함께 변경)
      const children = MENU_REGISTRY.filter((m) => m.parent === menu_key);
      const allKeys = [menu_key, ...children.map((c) => c.key)];

      const upsertRows = allKeys.map((key) => {
        const item = registry.find((x) => x.key === key);
        return { menu_key: key, label: item?.label ?? key, [field]: next, updated_at: new Date().toISOString() };
      });

      const { error } = await supabase.from("admin_menu_permissions").upsert(upsertRows, { onConflict: "menu_key" });
      if (error) throw error;

      const keySet = new Set(allKeys);
      setRows((prev) => prev.map((r) => keySet.has(r.menu_key) ? { ...r, [field]: next } : r));
    } catch (e: unknown) {
      setMsg({ text: (e as Error)?.message ?? String(e), ok: false });
    } finally {
      setSavingKey(null);
    }
  };

  const onSyncPrune = async () => {
    setMsg(null);
    setSyncing(true);
    try {
      const ok = await assertMainAdmin();
      if (!ok.ok) return;

      await supabase.from("admin_menu_permissions").upsert(
        registry.map((m) => ({
          menu_key: m.key,
          label: m.label,
          general_access: "full" as AccessLevel,
          company_access: "full" as AccessLevel,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "menu_key" }
      );
      await pruneDb();

      const { data, error } = await supabase.from("admin_menu_permissions").select("menu_key,label,general_access,company_access,updated_at");
      if (error) throw error;
      setRows(buildUiRows((data as DbRow[]) ?? []));
      setMsg({ text: "동기화/정리 완료 (모든 권한이 FULL로 초기화됨)", ok: true });
    } catch (e: unknown) {
      setMsg({ text: (e as Error)?.message ?? String(e), ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const { navGroups, settingsRows } = useMemo(() => {
    const rowMap: Record<string, UiRow> = {};
    for (const r of rows) rowMap[r.menu_key] = r;

    const navParents = MENU_REGISTRY
      .filter((m) => m.group === "nav" && !m.parent)
      .sort((a, b) => a.order - b.order)
      .map((m) => rowMap[m.key])
      .filter(Boolean) as UiRow[];

    const groups: SectionGroup[] = navParents.map((parent) => {
      const children = MENU_REGISTRY
        .filter((m) => m.parent === parent.menu_key)
        .sort((a, b) => a.order - b.order)
        .map((m) => rowMap[m.key])
        .filter(Boolean) as UiRow[];
      return { parent, children };
    });

    const settingsRows = MENU_REGISTRY
      .filter((m) => m.group === "settings")
      .sort((a, b) => a.order - b.order)
      .map((m) => rowMap[m.key])
      .filter(Boolean) as UiRow[];

    return { navGroups: groups, settingsRows };
  }, [rows]);

  const AccessSelect = ({
    row,
    field,
  }: {
    row: UiRow;
    field: "general_access" | "company_access";
  }) => {
    if (row.mainOnly) {
      return <span style={{ fontSize: 11, color: "#9CA3AF" }}>메인전용</span>;
    }
    const isSaving = savingKey === `${row.menu_key}__${field}`;
    const value = row[field];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <AccessBadge value={value} />
        <select
          value={value}
          onChange={(e) => onChange(row.menu_key, field, e.target.value as AccessLevel)}
          disabled={isSaving}
          style={{
            height: 28, padding: "0 6px", borderRadius: 6,
            border: `1px solid ${ACCESS_CONFIG[value]?.border ?? "#D1D5DB"}`,
            background: "white", fontWeight: 700, fontSize: 12,
            color: "#111827", cursor: isSaving ? "not-allowed" : "pointer",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {OPTIONS.map((v) => (
            <option key={v} value={v}>{ACCESS_CONFIG[v].label}</option>
          ))}
        </select>
        {isSaving && <span style={{ fontSize: 11, color: "#6B7280" }}>저장...</span>}
      </div>
    );
  };

  // 행 공통 레이아웃 (grid)
  const ROW_GRID: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 90px 220px 220px",
    alignItems: "center",
    gap: 12,
  };

  const ColHeader = () => (
    <div style={{ ...ROW_GRID, padding: "6px 16px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
      <div />
      <div style={{ fontSize: 11, fontWeight: 900, color: "#475569", textAlign: "center" }}>메인관리자</div>
      <div style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>일반관리자</div>
      <div style={{ fontSize: 11, fontWeight: 900, color: "#475569" }}>업체관리자</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "Pretendard, system-ui, -apple-system, sans-serif", maxWidth: 1000, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 0, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 18, color: "#0F172A" }}>메뉴 권한 설정</div>
          <div style={{ marginTop: 4, color: "#6B7280", fontSize: 13 }}>메인관리자만 변경 가능 · 신규 메뉴는 페이지 접속 시 자동으로 추가됩니다</div>
        </div>
        <button
          onClick={onSyncPrune}
          disabled={loading || syncing}
          style={{
            height: 36, padding: "0 14px", borderRadius: 6,
            border: "1px solid #111827", background: syncing ? "#6B7280" : "#111827",
            color: "white", fontWeight: 900, fontSize: 13, cursor: loading || syncing ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {syncing ? "동기화 중..." : "전체 초기화 (FULL)"}
        </button>
      </div>

      {/* 범례 */}
      <div style={{ marginTop: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "10px 16px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        {OPTIONS.map((v) => {
          const cfg = ACCESS_CONFIG[v];
          return (
            <div key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <AccessBadge value={v} />
              <span style={{ color: "#374151" }}>{cfg.label}</span>
            </div>
          );
        })}
        <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: "auto" }}>변경 즉시 저장됩니다</span>
      </div>

      {msg && (
        <div style={{ marginTop: 8, padding: "10px 16px", borderRadius: 6, background: msg.ok ? "#DCFCE7" : "#FEE2E2", border: `1px solid ${msg.ok ? "#86EFAC" : "#FCA5A5"}`, color: msg.ok ? "#166534" : "#991B1B", fontWeight: 700, fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 20, textAlign: "center", color: "#6B7280", fontWeight: 700 }}>불러오는 중...</div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* 상단 메뉴 섹션 */}
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#F1F5F9", borderBottom: "1px solid #E2E8F0", fontWeight: 950, fontSize: 13, color: "#1E293B", letterSpacing: "0.03em" }}>
              상단 메뉴
            </div>
            <ColHeader />
            {navGroups.map(({ parent, children }) => (
              <div key={parent.menu_key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                {/* 최상위 메뉴 행 */}
                <div style={{ ...ROW_GRID, padding: "10px 16px", background: "#FAFAFA" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 900, fontSize: 14, color: "#0F172A" }}>{parent.label}</span>
                    {children.length > 0 && (
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>하위 {children.length}개</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <AccessBadge value="full" />
                  </div>
                  <AccessSelect row={parent} field="general_access" />
                  <AccessSelect row={parent} field="company_access" />
                </div>
                {/* 하위 메뉴 행 */}
                {children.map((child, idx) => (
                  <div
                    key={child.menu_key}
                    style={{
                      ...ROW_GRID,
                      padding: "8px 16px 8px 36px",
                      borderTop: "1px solid #F1F5F9",
                      background: idx % 2 === 0 ? "#FFFFFF" : "#FAFEFE",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#CBD5E1", fontSize: 14 }}>└</span>
                      <span style={{ fontSize: 13, color: "#374151", fontWeight: 700 }}>{child.label}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <AccessBadge value="full" />
                    </div>
                    <AccessSelect row={child} field="general_access" />
                    <AccessSelect row={child} field="company_access" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 설정 메뉴 섹션 */}
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#F1F5F9", borderBottom: "1px solid #E2E8F0", fontWeight: 950, fontSize: 13, color: "#1E293B", letterSpacing: "0.03em" }}>
              설정 메뉴
            </div>
            <ColHeader />
            {settingsRows.map((row, idx) => (
              <div
                key={row.menu_key}
                style={{
                  ...ROW_GRID,
                  padding: "10px 16px",
                  borderBottom: idx < settingsRows.length - 1 ? "1px solid #F1F5F9" : "none",
                  background: idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{row.label}</span>
                  {row.mainOnly && <span style={{ fontSize: 11, color: "#9CA3AF" }}>메인전용</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <AccessBadge value="full" />
                </div>
                <AccessSelect row={row} field="general_access" />
                <AccessSelect row={row} field="company_access" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
