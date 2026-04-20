"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AdminAccessProvider, AccessLevel, MenuAccessMap } from "@/lib/admin-access";
import { getSettingsItems, getSubItems, findMenuKeyByPath } from "@/lib/menu-registry";
import { isGeneralAdminWorkPart, isMainAdminIdentity, isCompanyAdminFlag, isCenterAdminFlag } from "@/lib/admin-role";

const MAX_W = 1700;
const AUTO_LOGOUT_MS = 60 * 60 * 1000;

type Profile = {
  name: string | null;
  approval_status: string | null;
  is_admin: boolean | null;
  work_part: string | null;
  is_company_admin: boolean | null;
  is_center_admin: boolean | null;
};

type PermRow = {
  menu_key: string;
  general_access: AccessLevel;
  center_access: AccessLevel;
  company_access: AccessLevel;
};

async function waitForSession(retry = 6, delayMs = 500) {
  for (let i = 0; i < retry; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

async function readProfileWithRetry(uid: string, retry = 6, delayMs = 500) {
  let lastError: unknown = null;
  for (let i = 0; i < retry; i++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("name,approval_status,is_admin,work_part,is_company_admin,is_center_admin")
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
  const [isCenterAdmin, setIsCenterAdmin] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({});
  const [loginUserName, setLoginUserName] = useState("");

  const [photosOpen, setPhotosOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [workLogOpen, setWorkLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [operationOpen, setOperationOpen] = useState(false);
  const [insuOpen, setInsuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardBootstrappedRef = useRef(false);

  const loggingOutRef = useRef(false);

  const SETTINGS_ITEMS = useMemo(() => getSettingsItems(), []);
  const SETTINGS_ROOT = "/admin/settings/file-upload";

  const PHOTO_ITEMS     = useMemo(() => getSubItems("admin_photos"),    []);
  const VEHICLE_ITEMS   = useMemo(() => getSubItems("admin_vehicle"),   []);
  const OPERATION_ITEMS = useMemo(() => getSubItems("admin_operation"), []);
  const NOTICE_ITEMS    = useMemo(() => getSubItems("admin_notice"),    []);
  const WORK_LOG_ITEMS  = useMemo(() => getSubItems("admin_work_log"),  []);
  const INSU_ITEMS      = useMemo(() => getSubItems("admin_insu"),      []);

  const getAccess = (menuKey: string, mainOnly?: boolean): AccessLevel => {
    if (isMainAdmin) return "full";
    if (mainOnly) return "hidden";
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
    setOperationOpen(false);
    setInsuOpen(false);
  };

  const redirectToLogin = (reason?: "timeout") => {
    const next = reason ? `/login?reason=${reason}` : "/login";
    window.location.replace(next);
  };

  const openDropdown = (which: "photos" | "vehicle" | "notice" | "worklog" | "settings" | "operation" | "insu") => {
    clearCloseTimer();
    setPhotosOpen(which === "photos");
    setVehicleOpen(which === "vehicle");
    setNoticeOpen(which === "notice");
    setWorkLogOpen(which === "worklog");
    setSettingsOpen(which === "settings");
    setOperationOpen(which === "operation");
    setInsuOpen(which === "insu");
  };

  const closeDropdownDelayed = (which: "photos" | "vehicle" | "notice" | "worklog" | "settings" | "operation" | "insu") => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      if (which === "photos") setPhotosOpen(false);
      if (which === "vehicle") setVehicleOpen(false);
      if (which === "notice") setNoticeOpen(false);
      if (which === "worklog") setWorkLogOpen(false);
      if (which === "settings") setSettingsOpen(false);
      if (which === "operation") setOperationOpen(false);
      if (which === "insu") setInsuOpen(false);
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
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    background: active ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)" : "transparent",
    color: active ? "white" : "#374151",
    fontWeight: 800 as const,
    fontSize: 13.5,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
    boxShadow: active ? "0 4px 14px rgba(16,59,83,0.28)" : "none",
    transition: "all 0.15s ease",
  });

  const dropdownBoxStyle: React.CSSProperties = {
    position: "absolute",
    top: 46,
    left: "50%",
    transform: "translateX(-50%)",
    width: "max-content",
    minWidth: 160,
    maxWidth: 360,
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    boxShadow: "0 20px 48px rgba(2,32,46,0.18), 0 4px 12px rgba(2,32,46,0.08)",
    padding: 6,
    zIndex: 60,
    animation: "dropdownFadeIn 0.15s ease",
  };

  const dropdownItemStyle = (active: boolean): React.CSSProperties => ({
    display: "block",
    textDecoration: "none",
    padding: "9px 14px",
    borderRadius: 8,
    color: active ? "#103b53" : "#374151",
    fontWeight: active ? 900 : 700,
    fontSize: 13,
    background: active ? "linear-gradient(135deg,#EFF6FF 0%,#F0FDF4 100%)" : "transparent",
    whiteSpace: "nowrap",
    borderLeft: active ? "3px solid #103b53" : "3px solid transparent",
    transition: "background 0.12s ease",
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
  const isVehicleActive = pathname.startsWith("/admin/vehicles") && !pathname.startsWith("/admin/vehicles/cdc");
  const isOperationActive = pathname.startsWith("/admin/operation") || pathname.startsWith("/admin/vehicles/cdc");
  const isWorkLogActive = pathname.startsWith("/admin/work-log");
  const isSettingsActive = pathname.startsWith("/admin/settings");
  const isInsuActive = pathname.startsWith("/admin/insu");

  const canShow = (menuKey: string, mainOnly?: boolean) => getAccess(menuKey, mainOnly) !== "hidden";
  const visibleSettingsItems = SETTINGS_ITEMS.filter((it) => canShow(it.key, it.mainOnly));
  const canShowPhotos = canShow("admin_photos");
  const canShowOperation = canShow("admin_operation");
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
        const center = isCenterAdminFlag(p?.is_center_admin);
        const company = isCompanyAdminFlag(p?.is_company_admin);

        if (!main && !general && !center && !company) {
          try {
            await supabase.auth.signOut();
          } catch {}
          hardToLogin();
          return;
        }

        if (!mounted || runId !== my) return;

        setIsMainAdmin(main);
        setIsGeneralAdmin(!main && general);
        setIsCenterAdmin(!main && !general && center);
        setIsCompanyAdmin(!main && !general && !center && company);
        setLoginUserName(String(p?.name ?? "").trim());

        if (main) {
          if (!mounted || runId !== my) return;
          setMenuAccess({});
        } else {
          const { data: perms, error: permErr } = await supabase
            .from("admin_menu_permissions")
            .select("menu_key,general_access,center_access,company_access");
          if (permErr) throw permErr;

          const map: MenuAccessMap = {};
          for (const r of (perms as PermRow[]) ?? []) {
            map[r.menu_key] = company ? r.company_access : center ? r.center_access : r.general_access;
          }

          if (!mounted || runId !== my) return;
          setMenuAccess(map);

          const menuKey = findMenuKeyByPath(pathname);
          if (menuKey) {
            const access = (map?.[menuKey] ?? "hidden") as AccessLevel;
            if (access === "hidden") {
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

      if (event === "SIGNED_OUT") {
        hardToLogin();
        return;
      }

      // INITIAL_SESSION은 runGuard에서 이미 처리하므로 여기선 무시
      if (event === "INITIAL_SESSION") return;

      // 토큰 갱신 중 일시적으로 세션이 null일 수 있으므로 무시
      if (!session) return;

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

    const access = getAccess(menuKey);
    if (access === "hidden") {
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
    <AdminAccessProvider isMainAdmin={isMainAdmin} isGeneralAdmin={isGeneralAdmin} isCenterAdmin={isCenterAdmin} isCompanyAdmin={isCompanyAdmin} menuAccess={menuAccess}>
      <style>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .nav-pill:hover { background: #F1F5F9 !important; color: #103b53 !important; }
        .nav-pill-active:hover { filter: brightness(0.9); }
        .nav-dropdown-item:hover { background: #F8FAFC !important; color: #103b53 !important; }
        .logout-btn:hover:not(:disabled) { filter: brightness(0.88); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(16,59,83,0.32) !important; }
        .logout-btn:active:not(:disabled) { transform: translateY(0); }
      `}</style>
      <div className="ha-surface ha-admin" style={{ minHeight: "100vh", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", position: "relative", overflow: "hidden" }}>
        <div
          className="ha-admin-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid #E2E8F0",
            boxShadow: "0 4px 20px rgba(2,32,46,0.07)",
          }}
        >
          <div
            style={{
              maxWidth: MAX_W,
              margin: "0 auto",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 10 }}>
              <Link href="/admin" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
                <Image src="/logo.png" alt="logo" width={108} height={26} priority style={{ width: "auto", height: 26 }} />
              </Link>
            </div>

            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                <Link href="/admin" className={isActive("/admin") ? "nav-pill-active" : "nav-pill"} style={pillStyle(isActive("/admin"))}>
                  메인
                </Link>

                {/* 사진 */}
                {canShowPhotos ? (
                  <div
                    onMouseEnter={() => openDropdown("photos")}
                    onMouseLeave={() => closeDropdownDelayed("photos")}
                    style={{ position: "relative" }}
                  >
                    <Link href="/admin/photos" className={isPhotosActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isPhotosActive)} onMouseEnter={() => openDropdown("photos")}>
                      사진
                    </Link>

                    {photosOpen && (
                      <div
                        onMouseEnter={() => openDropdown("photos")}
                        onMouseLeave={() => closeDropdownDelayed("photos")}
                        style={dropdownBoxStyle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {PHOTO_ITEMS.filter((it) => canShow(it.key)).map((it) => {
                          let active = false;
                          if (it.href === "/admin/photos") {
                            active = isExact(pathname, "/admin/photos");
                          } else if (it.href.startsWith("/admin/photos/delivery")) {
                            active = isSection(pathname, "/admin/photos/delivery");
                          } else if (it.href.startsWith("/admin/hazards")) {
                            active = isSection(pathname, "/admin/hazards");
                          } else {
                            active = pathname === it.href.split("?")[0];
                          }

                          return (
                            <Link key={it.key} href={it.href} className="nav-dropdown-item" style={dropdownItemStyle(active)}>
                              {it.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {canShowOperation ? (
                  <div
                    onMouseEnter={() => openDropdown("operation")}
                    onMouseLeave={() => closeDropdownDelayed("operation")}
                    style={{ position: "relative" }}
                  >
                    <Link href="/admin/operation" className={isOperationActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isOperationActive)} onMouseEnter={() => openDropdown("operation")}>
                      운영
                    </Link>

                    {operationOpen && (
                      <div
                        onMouseEnter={() => openDropdown("operation")}
                        onMouseLeave={() => closeDropdownDelayed("operation")}
                        style={dropdownBoxStyle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const visibleItems = OPERATION_ITEMS.filter((it) => canShow(it.key));
                          // 가장 긴 경로가 먼저 매칭되도록 best match 계산
                          const bestBase = visibleItems.reduce<string | null>((best, it) => {
                            const b = it.href.split("?")[0];
                            if (pathname === b || pathname.startsWith(b + "/")) {
                              if (!best || b.length > best.length) return b;
                            }
                            return best;
                          }, null);
                          return visibleItems.map((it) => {
                            const base = it.href.split("?")[0];
                            const active = base === bestBase;
                            return (
                              <Link key={it.key} href={it.href} className="nav-dropdown-item" style={dropdownItemStyle(active)}>
                                {it.label}
                              </Link>
                            );
                          });
                        })()}
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
                    <Link href="/admin/vehicles" className={isVehicleActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isVehicleActive)} onMouseEnter={() => openDropdown("vehicle")}>
                      차량
                    </Link>

                    {vehicleOpen && (
                      <div
                        onMouseEnter={() => openDropdown("vehicle")}
                        onMouseLeave={() => closeDropdownDelayed("vehicle")}
                        style={dropdownBoxStyle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {VEHICLE_ITEMS.filter((it) => canShow(it.key)).map((it) => {
                          const base = it.href.split("?")[0];
                          const active = base === "/admin/vehicles"
                            ? pathname === "/admin/vehicles"
                            : pathname === base || pathname.startsWith(base + "/");
                          return (
                            <Link key={it.key} href={it.href} className="nav-dropdown-item" style={dropdownItemStyle(active)}>
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
                  <Link href="/admin/notice/boards?board=notice" className={isNoticeActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isNoticeActive)} onMouseEnter={() => openDropdown("notice")}>
                    게시판
                  </Link>

                  {noticeOpen && (
                    <div
                      onMouseEnter={() => openDropdown("notice")}
                      onMouseLeave={() => closeDropdownDelayed("notice")}
                      style={dropdownBoxStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {NOTICE_ITEMS.filter((it) => canShow(it.key)).map((it) => {
                        const baseHref = it.href.split("?")[0];
                        const active = pathname === baseHref || pathname.startsWith(baseHref + "/");
                        return (
                          <Link key={it.key} href={it.href} style={dropdownItemStyle(active)}>
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
                    <Link href="/admin/work-log?tab=basic" className={isWorkLogActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isWorkLogActive)} onMouseEnter={() => openDropdown("worklog")}>
                      근태
                    </Link>

                    {workLogOpen && (
                      <div
                        onMouseEnter={() => openDropdown("worklog")}
                        onMouseLeave={() => closeDropdownDelayed("worklog")}
                        style={dropdownBoxStyle}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {WORK_LOG_ITEMS.filter((it) => canShow(it.key)).map((it) => {
                          const active = it.href.includes("tab=detail")
                            ? pathname.startsWith("/admin/work-log") && workLogTab === "detail"
                            : pathname === "/admin/work-log" && workLogTab === "basic";

                          return (
                            <Link key={it.key} href={it.href} className="nav-dropdown-item" style={dropdownItemStyle(active)}>
                              {it.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* 인수증 */}
                <div
                  onMouseEnter={() => openDropdown("insu")}
                  onMouseLeave={() => closeDropdownDelayed("insu")}
                  style={{ position: "relative" }}
                >
                  <Link href="/admin/insu" className={isInsuActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isInsuActive)} onMouseEnter={() => openDropdown("insu")}>
                    인수증
                  </Link>

                  {insuOpen && (
                    <div
                      onMouseEnter={() => openDropdown("insu")}
                      onMouseLeave={() => closeDropdownDelayed("insu")}
                      style={dropdownBoxStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {INSU_ITEMS.map((it) => {
                        const base = it.href.split("?")[0];
                        const active = base === "/admin/insu"
                          ? pathname === "/admin/insu"
                          : pathname === base || pathname.startsWith(base + "/");
                        return (
                          <Link key={it.key} href={it.href} style={dropdownItemStyle(active)}>
                            {it.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 설정 */}
                {visibleSettingsItems.length > 0 ? (
                  <div
                    onMouseEnter={() => openDropdown("settings")}
                    onMouseLeave={() => closeDropdownDelayed("settings")}
                    style={{ position: "relative" }}
                  >
                    <Link href={SETTINGS_ROOT} className={isSettingsActive ? "nav-pill-active" : "nav-pill"} style={pillStyle(isSettingsActive)} onMouseEnter={() => openDropdown("settings")}>
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
                            <Link key={it.key} href={it.href} className="nav-dropdown-item" style={dropdownItemStyle(active)}>
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

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                  background: "#F8FAFC",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "999px",
                    background: "linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)",
                    boxShadow: "0 0 0 2.5px rgba(20,184,166,0.22)",
                    flexShrink: 0,
                  }}
                />
                {loginUserName || "User"}
              </div>
              <button
                className="logout-btn"
                onClick={onLogout}
                disabled={checking}
                style={{
                  height: 34,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 13,
                  boxShadow: "0 4px 14px rgba(16,59,83,0.28)",
                  cursor: checking ? "not-allowed" : "pointer",
                  opacity: checking ? 0.6 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>

        <div className="ha-admin-content" style={{ maxWidth: "none", padding: "18px 24px" }}>{children}</div>
      </div>
    </AdminAccessProvider>
  );
}

