"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AdminAccessProvider, AccessLevel, MenuAccessMap } from "@/lib/admin-access";
import { getSettingsItems, findMenuKeyByPath } from "@/lib/menu-registry";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";

const MAX_W = 1700;
const AUTO_LOGOUT_MS = 60 * 60 * 1000;

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

async function waitForSession(retry = 20, delayMs = 500) {
  for (let i = 0; i < retry; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

async function readProfileWithRetry(uid: string, retry = 20, delayMs = 500) {
  let lastError: unknown = null;
  for (let i = 0; i < retry; i++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("name,approval_status,is_admin,work_part")
      .eq("id", uid)
      .single();

    if (!error && data) return data as Profile;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError ?? new Error("Failed to load profile");
}

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
  const [workLogTab, setWorkLogTab] = useState<"basic" | "detail">("basic");

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  const [checking, setChecking] = useState<boolean>(isAdminPath);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({});
  const [loginUserName, setLoginUserName] = useState("");

  const [photosOpen, setPhotosOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [workLogOpen, setWorkLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardBootstrappedRef = useRef(false);

  const loggingOutRef = useRef(false);

  const SETTINGS_ITEMS = useMemo(() => getSettingsItems(), []);
  const SETTINGS_ROOT = "/admin/settings/store-master";

  const PHOTO_ITEMS = useMemo(
    () => [
      { label: "현장사진", href: "/admin/photos" },
      { label: "배송사진", href: "/admin/photos/delivery" },
      { label: "위험요인", href: "/admin/hazards" },
    ],
    []
  );

  const VEHICLE_ITEMS = useMemo(
    () => [
      { label: "단품별/물동량", href: "/admin/vehicles" },
      { label: "운행일보", href: "/admin/vehicles/report" },
      { label: "점착", href: "/admin/vehicles/adhesion" },
      { label: "CDC", href: "/admin/vehicles/cdc" },
    ],
    []
  );

  // 게시판 섹션: 달력/게시판을 /admin/notice/* 로 통일
  const NOTICE_ITEMS = useMemo(
    () => [
      { label: "\uac8c\uc2dc\ud310", href: "/admin/notice/boards?board=notice" },
      { label: "\uc77c\uc815\ub2ec\ub825", href: "/admin/notice/calendar" },
    ],
    []
  );

  const WORK_LOG_ITEMS = useMemo(
    () => [
      { label: "기본근태", href: "/admin/work-log?tab=basic" },
      { label: "상세근태", href: "/admin/work-log?tab=detail" },
    ],
    []
  );

  const getAccess = (menuKey: string, mainOnly?: boolean): AccessLevel => {
    if (isMainAdmin) return "full";
    if (mainOnly) return "hidden";
    if (isCompanyAdmin && menuKey === "settings_driver_master") return "hidden";
    if (isCompanyAdmin && (menuKey === "admin_work_log" || menuKey === "settings_user_master")) return "full";
    return (menuAccess?.[menuKey] ?? "hidden") as AccessLevel;
  };

  const clearCloseTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = null;
  };

  const closeAll = () => {
    setPhotosOpen(false);
    setVehicleOpen(false);
    setNoticeOpen(false);
    setWorkLogOpen(false);
    setSettingsOpen(false);
  };

  const redirectToLogin = (reason?: "timeout") => {
    const next = reason ? `/login?reason=${reason}` : "/login";
    window.location.replace(next);
  };

  const openDropdown = (which: "photos" | "vehicle" | "notice" | "worklog" | "settings") => {
    clearCloseTimer();
    if (which === "photos") {
      setPhotosOpen(true);
      setVehicleOpen(false);
      setNoticeOpen(false);
      setWorkLogOpen(false);
      setSettingsOpen(false);
    } else if (which === "vehicle") {
      setPhotosOpen(false);
      setVehicleOpen(true);
      setNoticeOpen(false);
      setWorkLogOpen(false);
      setSettingsOpen(false);
    } else if (which === "notice") {
      setPhotosOpen(false);
      setVehicleOpen(false);
      setNoticeOpen(true);
      setWorkLogOpen(false);
      setSettingsOpen(false);
    } else if (which === "worklog") {
      setPhotosOpen(false);
      setVehicleOpen(false);
      setNoticeOpen(false);
      setWorkLogOpen(true);
      setSettingsOpen(false);
    } else {
      setPhotosOpen(false);
      setVehicleOpen(false);
      setNoticeOpen(false);
      setWorkLogOpen(false);
      setSettingsOpen(true);
    }
  };

  const closeDropdownDelayed = (which: "photos" | "vehicle" | "notice" | "worklog" | "settings") => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      if (which === "photos") setPhotosOpen(false);
      if (which === "vehicle") setVehicleOpen(false);
      if (which === "notice") setNoticeOpen(false);
      if (which === "worklog") setWorkLogOpen(false);
      if (which === "settings") setSettingsOpen(false);
    }, 180);
  };

  useEffect(() => {
    const onDocClick = () => closeAll();
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    setWorkLogTab(tab === "detail" ? "detail" : "basic");
  }, [pathname]);

  const pillStyle = (active: boolean) => ({
    textDecoration: "none",
    padding: "8px 14px",
    borderRadius: 999,
    border: active ? "1px solid #0e7490" : "1px solid #c7d6e3",
    background: active ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)" : "rgba(255,255,255,0.86)",
    color: active ? "white" : "#113247",
    fontWeight: 950 as const,
    fontSize: 13,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
    boxShadow: active ? "0 8px 18px rgba(16,59,83,0.24)" : "0 1px 0 rgba(255,255,255,0.9) inset",
  });

  const dropdownBoxStyle: React.CSSProperties = {
    position: "absolute",
    top: 44,
    left: "50%",
    transform: "translateX(-50%)",
    width: "max-content",
    maxWidth: 360,
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #bcd0de",
    borderRadius: 16,
    boxShadow: "0 16px 36px rgba(2,32,46,0.16)",
    padding: 8,
    overflow: "hidden",
    zIndex: 60,
  };

  const dropdownItemStyle = (active: boolean): React.CSSProperties => ({
    display: "block",
    textDecoration: "none",
    padding: "10px 12px",
    borderRadius: 10,
    color: "#113247",
    fontWeight: 950,
    fontSize: 13,
    background: active ? "#e6f3f2" : "transparent",
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

  // 공지 라우트 포함
  const isNoticeActive = pathname.startsWith("/admin/notice");
  const isVehicleActive = pathname.startsWith("/admin/vehicles");
  const isWorkLogActive = pathname.startsWith("/admin/work-log");
  const isSettingsActive = pathname.startsWith("/admin/settings");

  const canShow = (menuKey: string, mainOnly?: boolean) => getAccess(menuKey, mainOnly) !== "hidden";
  const visibleSettingsItems = SETTINGS_ITEMS.filter((it) => canShow(it.key, it.mainOnly));
  const canShowPhotos = canShow("admin_photos");
  const canShowVehicle = canShow("admin_vehicle");

  useEffect(() => {
    let mounted = true;
    let runId = 0;
    let guardRetryTimer: ReturnType<typeof setTimeout> | null = null;

    if (!isAdminPath) {
      setChecking(false);
      return () => {
        mounted = false;
      };
    }

    const hardToLogin = () => redirectToLogin();

    const runGuard = async (showBlocking = !guardBootstrappedRef.current) => {
      const my = ++runId;
      if (showBlocking) setChecking(true);

      try {
        const session = await waitForSession();
        if (!session) {
          hardToLogin();
          return;
        }

        const uid = session.user.id;
        const p = await readProfileWithRetry(uid);

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
        setIsCompanyAdmin(false);
        setLoginUserName(String(p?.name ?? "").trim());

        if (main) {
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
            if (false && menuKey === "settings_driver_master") {
              router.replace("/admin");
              return;
            }
            const access = (map?.[menuKey] ?? "hidden") as AccessLevel;
            const vendorOverride = false;
            if (access === "hidden" && !vendorOverride) {
              router.replace("/admin");
              return;
            }
          }
        }
      } catch {
        const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (data?.session) {
          if (!mounted || runId !== my) return;
          guardRetryTimer = setTimeout(() => {
            if (mounted) void runGuard(showBlocking);
          }, 1500);
          return;
        }
        hardToLogin();
      } finally {
        if (mounted && runId === my) {
          guardBootstrappedRef.current = true;
          setChecking(false);
        }
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

      if (event === "TOKEN_REFRESHED") {
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void runGuard(false);
      }
    });

    return () => {
      mounted = false;
      if (guardRetryTimer) clearTimeout(guardRetryTimer);
      try {
        sub.subscription.unsubscribe();
      } catch {}
      clearCloseTimer();
      clearInactivityTimer();
    };
  }, [isAdminPath, pathname, router]);

  useEffect(() => {
    if (!isAdminPath) return;
    if (checking) return;
    if (isMainAdmin) return;

    const menuKey = findMenuKeyByPath(pathname);
    if (!menuKey) return;
    if (isCompanyAdmin && menuKey === "settings_driver_master") {
      router.replace("/admin");
      return;
    }

    const access = getAccess(menuKey);
    const vendorOverride = isCompanyAdmin && (menuKey === "admin_work_log" || menuKey === "settings_user_master");
    if (access === "hidden" && !vendorOverride) {
      router.replace("/admin");
    }
  }, [isAdminPath, pathname, checking, isMainAdmin, isCompanyAdmin, menuAccess, router]);

  useEffect(() => {
    if (!isAdminPath || checking) {
      clearInactivityTimer();
      return;
    }

    const kickByTimeout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      setChecking(true);
      try {
        await supabase.auth.signOut();
      } catch {}
      redirectToLogin("timeout");
    };

    const resetInactivityTimer = () => {
      clearInactivityTimer();
      inactivityTimerRef.current = setTimeout(() => {
        void kickByTimeout();
      }, AUTO_LOGOUT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer, { passive: true });
    });

    resetInactivityTimer();

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
      clearInactivityTimer();
    };
  }, [isAdminPath, checking]);

  const onLogout = async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setChecking(true);
    try {
      await supabase.auth.signOut();
    } finally {
      redirectToLogin();
    }
  };

  if (!isAdminPath) return <>{children}</>;

  if (checking) {
    return (
      <div className="ha-surface" style={{ minHeight: "100vh", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "24px 12px" }}>
          <div style={{ color: "#6B7280", fontWeight: 800, fontSize: 14 }}>권한 확인 중...</div>
        </div>
      </div>
    );
  }

  return (
    <AdminAccessProvider isMainAdmin={isMainAdmin} isGeneralAdmin={isGeneralAdmin} isCompanyAdmin={isCompanyAdmin} menuAccess={menuAccess}>
      <div className="ha-surface ha-admin" style={{ minHeight: "100vh", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", position: "relative", overflow: "hidden" }}>
        <div
          className="ha-admin-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "#fff",
            borderBottom: "1px solid #c7d6e3",
            boxShadow: "0 10px 24px rgba(2,32,46,0.08)",
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
                {canShowPhotos ? (
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
                ) : null}

                {canShowVehicle ? (
                  <div
                    onMouseEnter={() => openDropdown("vehicle")}
                    onMouseLeave={() => closeDropdownDelayed("vehicle")}
                    style={{ position: "relative" }}
                  >
                    <Link href="/admin/vehicles" style={pillStyle(isVehicleActive)} onMouseEnter={() => openDropdown("vehicle")}>
                      차량
                    </Link>

                    {vehicleOpen && (
                      <div
                        onMouseEnter={() => openDropdown("vehicle")}
                        onMouseLeave={() => closeDropdownDelayed("vehicle")}
                        style={dropdownBoxStyle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {VEHICLE_ITEMS.map((it) => {
                          const active =
                            it.href === "/admin/vehicles"
                              ? pathname === "/admin/vehicles"
                              : pathname === it.href || pathname.startsWith(it.href + "/");
                          return (
                            <Link key={it.href} href={it.href} style={dropdownItemStyle(active)}>
                              {it.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* 게시판 */}
                <div
                  onMouseEnter={() => openDropdown("notice")}
                  onMouseLeave={() => closeDropdownDelayed("notice")}
                  style={{ position: "relative" }}
                >
                  <Link href="/admin/notice/boards?board=notice" style={pillStyle(isNoticeActive)} onMouseEnter={() => openDropdown("notice")}>
                    게시판
                  </Link>

                  {noticeOpen && (
                    <div
                      onMouseEnter={() => openDropdown("notice")}
                      onMouseLeave={() => closeDropdownDelayed("notice")}
                      style={dropdownBoxStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {NOTICE_ITEMS.map((it) => {
                        const baseHref = it.href.replace(/\?.*/, "");
                        const active = pathname === baseHref || pathname.startsWith(baseHref + "/");
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
                  <div
                    onMouseEnter={() => openDropdown("worklog")}
                    onMouseLeave={() => closeDropdownDelayed("worklog")}
                    style={{ position: "relative" }}
                  >
                    <Link href="/admin/work-log?tab=basic" style={pillStyle(isWorkLogActive)} onMouseEnter={() => openDropdown("worklog")}>
                      근태
                    </Link>

                    {workLogOpen && (
                      <div
                        onMouseEnter={() => openDropdown("worklog")}
                        onMouseLeave={() => closeDropdownDelayed("worklog")}
                        style={dropdownBoxStyle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {WORK_LOG_ITEMS.map((it) => {
                          const active = it.href.includes("tab=detail")
                            ? pathname.startsWith("/admin/work-log") && workLogTab === "detail"
                            : pathname === "/admin/work-log" && workLogTab === "basic";

                          return (
                            <Link key={it.href} href={it.href} style={dropdownItemStyle(active)}>
                              {it.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* 설정 */}
                {visibleSettingsItems.length > 0 ? (
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
                        {visibleSettingsItems.map((it) => {
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
                ) : null}
              </nav>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: "1px solid #c7d6e3",
                  background: "#f8fbff",
                  color: "#113247",
                  fontSize: 13,
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "999px",
                    background: "linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)",
                    boxShadow: "0 0 0 2px rgba(20,184,166,0.16)",
                  }}
                />
                {loginUserName || "User"}
              </div>
              <button
                onClick={onLogout}
                disabled={checking}
                style={{
                  height: 36,
                  padding: "0 15px",
                  borderRadius: 999,
                  border: "1px solid #0e7490",
                  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
                  color: "#ffffff",
                  fontWeight: 900,
                  boxShadow: "0 8px 18px rgba(16,59,83,0.24)",
                  cursor: checking ? "not-allowed" : "pointer",
                  opacity: checking ? 0.6 : 1,
                }}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>

        <div className="ha-admin-content" style={{ maxWidth: MAX_W, margin: "0 auto", padding: "18px 12px" }}>{children}</div>
      </div>
    </AdminAccessProvider>
  );
}

