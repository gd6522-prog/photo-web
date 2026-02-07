"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const MAX_W = 1700;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeTimer = useRef<any>(null);

  const openSettings = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSettingsOpen(true);
  };

  const closeSettingsDelayed = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setSettingsOpen(false), 220);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await supabase.auth.getSession();
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => {
      mounted = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
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

  const SETTINGS_ROOT = "/admin/settings/store-master";

  const settingsItems = [
    { href: "/admin/settings/store-master", label: "1. 점포마스터 최신화" },
    { href: "/admin/settings/inspection-stores", label: "2. 검수점포 최신화" },
    { href: "/admin/settings/notices", label: "3. 공지사항 등록/작성" }, // ✅ 문구 변경
  ];

  const isSettingsActive = pathname.startsWith("/admin/settings");

  return (
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
              <Link href="/admin" style={pillStyle(isActive("/admin"))}>
                메인
              </Link>
              <Link href="/admin/photos" style={pillStyle(isActive("/admin/photos"))}>
                사진
              </Link>
              <Link href="/admin/calendar" style={pillStyle(isActive("/admin/calendar"))}>
                달력
              </Link>

              <div onMouseEnter={openSettings} onMouseLeave={closeSettingsDelayed} style={{ position: "relative" }}>
                <Link href={SETTINGS_ROOT} style={pillStyle(isSettingsActive)} onMouseEnter={openSettings}>
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
                    {settingsItems.map((it) => {
                      const active = pathname === it.href || pathname.startsWith(it.href + "/");
                      return (
                        <Link
                          key={it.href}
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
                cursor: checking ? "default" : "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "18px 12px" }}>{children}</div>
    </div>
  );
}
