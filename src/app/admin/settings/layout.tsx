"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAccess } from "@/lib/admin-access";
import { getSettingsItems } from "@/lib/menu-registry";

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isMainAdmin, isCompanyAdmin, menuAccess } = useAdminAccess();

  const items = useMemo(() => getSettingsItems(), []);

  const canShow = (item: { mainOnly?: boolean; key: string }) => {
    if (item.mainOnly && !isMainAdmin) return false;
    if (isCompanyAdmin && item.key === "settings_driver_master") return false;
    if (isMainAdmin) return true;
    return (menuAccess?.[item.key] ?? "hidden") !== "hidden";
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "290px minmax(0, 1fr)",
        gap: 18,
        alignItems: "start",
      }}
    >
      <aside
        style={{
          border: "1px solid #c9d9e4",
          borderRadius: 22,
          background: "#ffffff",
          boxShadow: "0 16px 34px rgba(2,32,46,0.08)",
          overflow: "hidden",
          position: "sticky",
          top: 88,
        }}
      >
        <div style={{ padding: 18, borderBottom: "1px solid #d9e6ef" }}>
          <div style={{ fontSize: 15, fontWeight: 950, color: "#103b53", letterSpacing: 0.1 }}>설정</div>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.filter((it) => canShow(it)).map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.key}
                href={it.href}
                style={{
                  textDecoration: "none",
                  padding: "12px 14px",
                  borderRadius: 0,
                  border: active ? "1px solid #7dd3fc" : "1px solid #d9e6ef",
                  background: active ? "#e0f2fe" : "#fbfdfe",
                  color: active ? "#075985" : "#103b53",
                  boxShadow: active ? "0 8px 18px rgba(16,59,83,0.10)" : "none",
                  fontWeight: 950,
                  fontSize: 14,
                }}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>{children}</div>

      <style jsx>{`
        @media (max-width: 1100px) {
          div[style*="grid-template-columns: 290px minmax(0, 1fr)"] {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
