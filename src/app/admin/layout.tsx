"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AdminAccessProvider, AccessLevel, MenuAccessMap } from "@/lib/admin-access";
import { getNavItems, getSettingsItems, findMenuKeyByPath, getAllItems } from "@/lib/menu-registry";

const MAX_W = 1700;

type Profile = {
  approval_status: string | null;
  is_admin: boolean | null;
  work_part: string | null;
};

type PermRow = {
  menu_key: string;
  general_access: AccessLevel;
};

function normWorkPart(v: any) {
  return String(v ?? "").trim();
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({}); // 일반관리자 권한 맵

  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeTimer = useRef<any>(null);
  const ranRef = useRef(false);

  const NAV_ITEMS = useMemo(() => getNavItems(), []);
  const SETTINGS_ITEMS = useMemo(() => getSettingsItems(), []);
  const SETTINGS_ROOT = "/admin/settings/store-master";

  const openSettings = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSettingsOpen(true);
  };
  const closeSettingsDelayed = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setSettingsOpen(false), 220);
  };

  const pillStyle = (active: boolean) => ({
    textDecoration: "none",
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #E5E7EB",
    background: active ? "#111827" : "white",
    color: active ? "white" : "#111827",
    fontWeight: 950 as const,
    fontSize: 13,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
  });

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // ✅ 메인관리자 접속 시: 레지스트리를 DB에 upsert하여 자동 갱신
  const syncRegistryToDB = async () => {
    const rows = getAllItems().map((m) => ({
      menu_key: m.key,
      label: m.label,
      // general_access는 보내지 않음 => 기존 설정 유지(없으면 DB default 'full')
    }));

    // upsert로 없으면 생성, label이 바뀌면 갱신
    // (RLS 때문에 메인관리자만 가능)
    await supabase.from("admin_menu_permissions").upsert(rows, { onConflict: "menu_key" });
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let mounted = true;

    (async () => {
      try {
        // 1) 세션 확인
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data.session;
        if (!session) {
          router.replace("/login");
          return;
        }

        const uid = session.user.id;

        // 2) 프로필 확인 (승인 + 관리자)
        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("approval_status,is_admin,work_part")
          .eq("id", uid)
          .single();

        if (pErr) throw pErr;

        const p = prof as Profile;

        if (p?.approval_status !== "approved") {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        const main = !!p?.is_admin;
        const general = normWorkPart(p?.work_part) === "관리자";

        if (!main && !general) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        if (!mounted) return;

        setIsMainAdmin(main);
        setIsGeneralAdmin(!main && general);

        // 3) ✅ 메인관리자면 DB 자동 갱신(레지스트리 upsert)
        if (main) {
          try {
            await syncRegistryToDB();
          } catch {
            // sync 실패해도 서비스 자체는 계속
          }
        }

        // 4) 일반관리자면 권한 테이블 로드
        //    (메뉴가 DB에 없으면 기본값 full로 취급되니 안전)
        if (!main) {
          const { data: perms, error: permErr } = await supabase
            .from("admin_menu_permissions")
            .select("menu_key,general_access");

          if (permErr) throw permErr;

          const map: MenuAccessMap = {};
          for (const r of (perms as PermRow[]) ?? []) {
            map[r.menu_key] = r.general_access;
          }
          if (mounted) setMenuAccess(map);
        }

        // 5) ✅ 접근 차단: hidden 메뉴면 /admin으로 튕김
        const menuKey = findMenuKeyByPath(pathname);
        if (!main && menuKey) {
          const access = (menuAccess?.[menuKey] ?? "full") as AccessLevel;
          if (access === "hidden") {
            router.replace("/admin");
            return;
          }
        }
      } catch {
        try {
          await supabase.auth.signOut();
        } catch {}
        router.replace("/login");
        return;
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ✅ pathname이 바뀔 때마다 hidden 접근 차단(일반관리자만)
  useEffect(() => {
    if (checking) return;
    if (isMainAdmin) return;

    const menuKey = findMenuKeyByPath(pathname);
    if (!menuKey) return;

    const access = (menuAccess?.[menuKey] ?? "full") as AccessLevel;
    if (access === "hidden") {
      router.replace("/admin");
    }
  }, [pathname, checking, isMainAdmin, menuAccess, router]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // ✅ 메뉴 보이기 여부(일반관리자 hidden이면 안 보이게)
  const canShow = (menuKey: string, mainOnly?: boolean) => {
    if (isMainAdmin) return true;
    if (mainOnly) return false;
    const access = (menuAccess?.[menuKey] ?? "full") as AccessLevel;
    return access !== "hidden";
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "system-ui" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "24px 12px" }}>
          <div style={{ color: "#6B7280", fontWeight: 800, fontSize: 14 }}>권한 확인 중...</div>
        </div>
      </div>
    );
  }

  return (
    <AdminAccessProvider isMainAdmin={isMainAdmin} isGeneralAdmin={isGeneralAdmin} menuAccess={menuAccess}>
      <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "system-ui" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "white",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div
            style={{
              maxWidth: MAX_W,
              margin: "0 auto",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              <Link href="/admin" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
                <img src="/logo.png" alt="logo" style={{ height: 26, width: "auto", display: "block" }} />
              </Link>
            </div>

            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {NAV_ITEMS.filter((it) => canShow(it.key, it.mainOnly)).map((it) => (
                  <Link key={it.key} href={it.href} style={pillStyle(isActive(it.href))}>
                    {it.label}
                  </Link>
                ))}

                {/* 설정 드롭다운 */}
                <div onMouseEnter={openSettings} onMouseLeave={closeSettingsDelayed} style={{ position: "relative" }}>
                  <Link href={SETTINGS_ROOT} style={pillStyle(pathname.startsWith("/admin/settings"))} onMouseEnter={openSettings}>
                    설정
                  </Link>

                  {settingsOpen && (
                    <div
                      onMouseEnter={openSettings}
                      onMouseLeave={closeSettingsDelayed}
                      style={{
                        position: "absolute",
                        top: 40,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "max-content",
                        maxWidth: 360,
                        background: "white",
                        border: "1px solid #E5E7EB",
                        borderRadius: 14,
                        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                        padding: 8,
                        overflow: "hidden",
                      }}
                    >
                      {SETTINGS_ITEMS.filter((it) => canShow(it.key, it.mainOnly)).map((it) => {
                        const active = pathname === it.href || pathname.startsWith(it.href + "/");
                        return (
                          <Link
                            key={it.key}
                            href={it.href}
                            style={{
                              display: "block",
                              textDecoration: "none",
                              padding: "10px 12px",
                              borderRadius: 10,
                              color: "#111827",
                              fontWeight: 950,
                              fontSize: 13,
                              background: active ? "#F3F4F6" : "white",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {it.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </nav>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={onLogout}
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: "1px solid #111827",
                  background: "white",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "18px 12px" }}>{children}</div>
      </div>
    </AdminAccessProvider>
  );
}