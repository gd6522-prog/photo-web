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

  // ✅ /admin에서만 이 레이아웃이 "가드/메뉴" 역할을 하도록 강제
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  const [checking, setChecking] = useState<boolean>(isAdminPath);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({});

  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeTimer = useRef<any>(null);

  // ✅ 로그아웃 중 중복 클릭 방지
  const loggingOutRef = useRef(false);

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
    }));
    await supabase.from("admin_menu_permissions").upsert(rows, { onConflict: "menu_key" });
  };

  // ✅ 권한 체크 (admin 경로에서만)
  useEffect(() => {
    let mounted = true;
    let runId = 0;

    // /admin이 아니면: 가드 자체를 끔 (login 포함 모든 페이지 정상 렌더)
    if (!isAdminPath) {
      setChecking(false);
      return () => {
        mounted = false;
      };
    }

    const hardToLogin = () => {
      // ✅ 가장 확실: SPA 라우팅 대신 하드 이동
      window.location.replace("/login");
    };

    const runGuard = async () => {
      const my = ++runId;
      setChecking(true);

      try {
        // 1) 세션 확인
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data.session;

        // ✅ 세션 없으면 즉시 /login (권한없음 화면 끼어들기 방지)
        if (!session) {
          hardToLogin();
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
          try {
            await supabase.auth.signOut();
          } catch {}
          hardToLogin();
          return;
        }

        const main = !!p?.is_admin;
        const general = normWorkPart(p?.work_part) === "관리자";

        if (!main && !general) {
          try {
            await supabase.auth.signOut();
          } catch {}
          hardToLogin();
          return;
        }

        if (!mounted || runId !== my) return;

        setIsMainAdmin(main);
        setIsGeneralAdmin(!main && general);

        // 3) 메인관리자면 레지스트리 sync
        if (main) {
          try {
            await syncRegistryToDB();
          } catch {
            // 무시
          }
          if (!mounted || runId !== my) return;
          setMenuAccess({});
        } else {
          // 4) 일반관리자 권한 로드
          const { data: perms, error: permErr } = await supabase
            .from("admin_menu_permissions")
            .select("menu_key,general_access");

          if (permErr) throw permErr;

          const map: MenuAccessMap = {};
          for (const r of (perms as PermRow[]) ?? []) {
            map[r.menu_key] = r.general_access;
          }
          if (!mounted || runId !== my) return;

          setMenuAccess(map);

          // 5) ✅ "현재 경로" hidden이면 즉시 튕김
          const menuKey = findMenuKeyByPath(pathname);
          if (menuKey) {
            const access = (map?.[menuKey] ?? "full") as AccessLevel;
            if (access === "hidden") {
              router.replace("/admin");
              router.refresh();
              return;
            }
          }
        }
      } catch {
        try {
          await supabase.auth.signOut();
        } catch {}
        hardToLogin();
        return;
      } finally {
        if (mounted && runId === my) setChecking(false);
      }
    };

    // 최초 실행
    runGuard();

    // ✅ auth 상태 변화 구독: 로그아웃/세션없음이면 즉시 하드 이동
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!isAdminPath) return;

      if (event === "SIGNED_OUT" || !session) {
        hardToLogin();
        return;
      }

      runGuard();
      router.refresh();
    });

    return () => {
      mounted = false;
      try {
        sub.subscription.unsubscribe();
      } catch {}
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [isAdminPath, pathname, router]);

  // ✅ pathname이 바뀔 때마다 hidden 접근 차단(일반관리자만)
  useEffect(() => {
    if (!isAdminPath) return;
    if (checking) return;
    if (isMainAdmin) return;

    const menuKey = findMenuKeyByPath(pathname);
    if (!menuKey) return;

    const access = (menuAccess?.[menuKey] ?? "full") as AccessLevel;
    if (access === "hidden") {
      router.replace("/admin");
      router.refresh();
    }
  }, [isAdminPath, pathname, checking, isMainAdmin, menuAccess, router]);

  // ✅ 로그아웃: 무조건 한 번에 /login 하드 이동
  const onLogout = async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    // 화면 잠그기(권한없음 화면 끼어들기 방지)
    setChecking(true);

    try {
      await supabase.auth.signOut();
    } finally {
      window.location.replace("/login");
    }
  };

  // ✅ /admin이 아닌 경로에서는 "그냥 children"만 렌더 (로그인 화면 정상)
  if (!isAdminPath) return <>{children}</>;

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
                disabled={checking}
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: "1px solid #111827",
                  background: "white",
                  fontWeight: 950,
                  cursor: checking ? "not-allowed" : "pointer",
                  opacity: checking ? 0.6 : 1,
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