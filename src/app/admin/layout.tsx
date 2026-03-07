"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AdminAccessProvider, AccessLevel, MenuAccessMap } from "@/lib/admin-access";
import { getSettingsItems, findMenuKeyByPath, getAllItems } from "@/lib/menu-registry";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";

const MAX_W = 1700;

type Profile = {
  name: string | null;
  approval_status: string | null;
  is_admin: boolean | null;
  work_part: string | null;
};

type PermRow = {
  menu_key: string;
  general_access: AccessLevel;
};

// 섹션(active) 판정 유틸
function isExact(pathname: string, href: string) {
  return pathname === href;
}
function isSection(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  const [checking, setChecking] = useState<boolean>(isAdminPath);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({});
  const [loginUserName, setLoginUserName] = useState("");

  const [photosOpen, setPhotosOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loggingOutRef = useRef(false);

  const SETTINGS_ITEMS = useMemo(() => getSettingsItems(), []);
  const SETTINGS_ROOT = "/admin/settings/store-master";

  const PHOTO_ITEMS = useMemo(
    () => [
      { label: "1. 현장사진", href: "/admin/photos" },
      { label: "2. 배송사진", href: "/admin/photos/delivery" },
      { label: "3. 위험요인", href: "/admin/hazards" },
    ],
    []
  );

  // 공지 섹션: 달력/공지사항을 /admin/notice/* 로 통일
  const NOTICE_ITEMS = useMemo(
    () => [
      { label: "1. 일정작성(달력)", href: "/admin/notice/calendar" },
      { label: "2. 공지사항 등록/작성", href: "/admin/notice/notices" },
    ],
    []
  );

  const clearCloseTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const closeAll = () => {
    setPhotosOpen(false);
    setNoticeOpen(false);
    setSettingsOpen(false);
  };

  const openDropdown = (which: "photos" | "notice" | "settings") => {
    clearCloseTimer();
    if (which === "photos") {
      setPhotosOpen(true);
      setNoticeOpen(false);
      setSettingsOpen(false);
    } else if (which === "notice") {
      setPhotosOpen(false);
      setNoticeOpen(true);
      setSettingsOpen(false);
    } else {
      setPhotosOpen(false);
      setNoticeOpen(false);
      setSettingsOpen(true);
    }
  };

  const closeDropdownDelayed = (which: "photos" | "notice" | "settings") => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      if (which === "photos") setPhotosOpen(false);
      if (which === "notice") setNoticeOpen(false);
      if (which === "settings") setSettingsOpen(false);
    }, 180);
  };

  useEffect(() => {
    const onDocClick = () => closeAll();
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

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

  const dropdownBoxStyle: React.CSSProperties = {
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
    zIndex: 60,
  };

  const dropdownItemStyle = (active: boolean): React.CSSProperties => ({
    display: "block",
    textDecoration: "none",
    padding: "10px 12px",
    borderRadius: 10,
    color: "#111827",
    fontWeight: 950,
    fontSize: 13,
    background: active ? "#F3F4F6" : "white",
    whiteSpace: "nowrap",
  });

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // 상단 사진 pill은 섹션 단위로만 active
  const isPhotosActive =
    isSection(pathname, "/admin/photos") ||
    isSection(pathname, "/admin/delivery-photos") ||
    isSection(pathname, "/admin/hazards");

  // ??怨듭? 猷⑦듃 ?ы븿
  const isNoticeActive = pathname.startsWith("/admin/notice");
  const isSettingsActive = pathname.startsWith("/admin/settings");

  const canShow = (menuKey: string, mainOnly?: boolean) => {
    if (isMainAdmin) return true;
    if (mainOnly) return false;
    const access = (menuAccess?.[menuKey] ?? "full") as AccessLevel;
    return access !== "hidden";
  };

  const syncRegistryToDB = async () => {
    const rows = getAllItems().map((m) => ({ menu_key: m.key, label: m.label }));
    await supabase.from("admin_menu_permissions").upsert(rows, { onConflict: "menu_key" });
  };

  useEffect(() => {
    let mounted = true;
    let runId = 0;

    if (!isAdminPath) {
      setChecking(false);
      return () => {
        mounted = false;
      };
    }

    const hardToLogin = () => window.location.replace("/login");

    const runGuard = async () => {
      const my = ++runId;
      setChecking(true);

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data.session;
        if (!session) {
          hardToLogin();
          return;
        }

        const uid = session.user.id;

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("name,approval_status,is_admin,work_part")
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

        const hardMain = isMainAdminIdentity(uid, session.user.email ?? "");
        const main = hardMain || !!p?.is_admin;
        const general = isGeneralAdminWorkPart(p?.work_part);

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
        setLoginUserName(String(p?.name ?? "").trim());

        if (main) {
          try {
            await syncRegistryToDB();
          } catch {}
          if (!mounted || runId !== my) return;
          setMenuAccess({});
        } else {
          const { data: perms, error: permErr } = await supabase
            .from("admin_menu_permissions")
            .select("menu_key,general_access");
          if (permErr) throw permErr;

          const map: MenuAccessMap = {};
          for (const r of (perms as PermRow[]) ?? []) map[r.menu_key] = r.general_access;

          if (!mounted || runId !== my) return;
          setMenuAccess(map);

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
      } finally {
        if (mounted && runId === my) setChecking(false);
      }
    };

    runGuard();

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
      clearCloseTimer();
    };
  }, [isAdminPath, pathname, router]);

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

  const onLogout = async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setChecking(true);
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.replace("/login");
    }
  };

  if (!isAdminPath) return <>{children}</>;

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
      <div style={{ minHeight: "100vh", background: "#F3F5F8", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            borderBottom: "1px solid #DDE3EA",
            boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
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
            <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 10 }}>
              <Link href="/admin" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
                <img src="/logo.png" alt="logo" style={{ height: 26, width: "auto", display: "block" }} />
              </Link>
            </div>

            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Link href="/admin" style={pillStyle(isActive("/admin"))}>
                  메인
                </Link>

                {/* 사진 */}
                <div
                  onMouseEnter={() => openDropdown("photos")}
                  onMouseLeave={() => closeDropdownDelayed("photos")}
                  style={{ position: "relative" }}
                >
                  <Link href="/admin/photos" style={pillStyle(isPhotosActive)} onMouseEnter={() => openDropdown("photos")}>
                    사진
                  </Link>

                  {photosOpen && (
                    <div
                      onMouseEnter={() => openDropdown("photos")}
                      onMouseLeave={() => closeDropdownDelayed("photos")}
                      style={dropdownBoxStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {PHOTO_ITEMS.map((it) => {
                        // 활성 드롭다운 판정:
                        // - 현장사진(/admin/photos)은 exact만 active
                        // - 배송사진(/admin/photos/delivery)은 섹션(active) 허용
                        // - 위험요인(/admin/hazards)은 섹션(active) 허용
                        let active = false;
                        if (it.href === "/admin/photos") {
                          active = isExact(pathname, "/admin/photos");
                        } else if (it.href === "/admin/photos/delivery") {
                          active = isSection(pathname, "/admin/photos/delivery");
                        } else if (it.href === "/admin/hazards") {
                          active = isSection(pathname, "/admin/hazards");
                        } else {
                          active = pathname === it.href;
                        }

                        return (
                          <Link key={it.href} href={it.href} style={dropdownItemStyle(active)}>
                            {it.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 공지 */}
                <div
                  onMouseEnter={() => openDropdown("notice")}
                  onMouseLeave={() => closeDropdownDelayed("notice")}
                  style={{ position: "relative" }}
                >
                  <Link href="/admin/notice/calendar" style={pillStyle(isNoticeActive)} onMouseEnter={() => openDropdown("notice")}>
                    공지
                  </Link>

                  {noticeOpen && (
                    <div
                      onMouseEnter={() => openDropdown("notice")}
                      onMouseLeave={() => closeDropdownDelayed("notice")}
                      style={dropdownBoxStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {NOTICE_ITEMS.map((it) => {
                        const active = pathname === it.href || pathname.startsWith(it.href + "/");
                        return (
                          <Link key={it.href} href={it.href} style={dropdownItemStyle(active)}>
                            {it.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {canShow("admin_work_log") ? (
                  <Link href="/admin/work-log" style={pillStyle(isActive("/admin/work-log"))}>
                    근태
                  </Link>
                ) : null}

                {/* 설정 */}
                <div
                  onMouseEnter={() => openDropdown("settings")}
                  onMouseLeave={() => closeDropdownDelayed("settings")}
                  style={{ position: "relative" }}
                >
                  <Link href={SETTINGS_ROOT} style={pillStyle(isSettingsActive)} onMouseEnter={() => openDropdown("settings")}>
                    설정
                  </Link>

                  {settingsOpen && (
                    <div
                      onMouseEnter={() => openDropdown("settings")}
                      onMouseLeave={() => closeDropdownDelayed("settings")}
                      style={dropdownBoxStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {SETTINGS_ITEMS.filter((it) => canShow(it.key, it.mainOnly)).map((it) => {
                        const active = pathname === it.href || pathname.startsWith(it.href + "/");
                        return (
                          <Link key={it.key} href={it.href} style={dropdownItemStyle(active)}>
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
              <span style={{ color: "#334155", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{loginUserName || "User"}</span>
              <button
                onClick={onLogout}
                disabled={checking}
                style={{
                  height: 36,
                  padding: "0 15px",
                  borderRadius: 999,
                  border: "1px solid #CBD5E1",
                  background: "white",
                  color: "#111827",
                  fontWeight: 900,
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

