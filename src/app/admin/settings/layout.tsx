"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const items = [
    { href: "/admin/settings/store-master", label: "1. 점포마스터 최신화" },
    { href: "/admin/settings/inspection-stores", label: "2. 검수점포 최신화" },
    { href: "/admin/settings/notices", label: "3. 공지사항 등록/작성" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px minmax(0, 1fr)",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* LEFT SIDEBAR */}
      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          background: "white",
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 950, color: "#111827", marginBottom: 10 }}>설정</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  textDecoration: "none",
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid #E5E7EB",
                  background: active ? "#111827" : "white",
                  color: active ? "white" : "#111827",
                  fontWeight: 950,
                  fontSize: 13,
                }}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* RIGHT CONTENT */}
      <div style={{ minWidth: 0 }}>{children}</div>

      <style jsx>{`
        @media (max-width: 1100px) {
          div[style*="grid-template-columns: 260px minmax(0, 1fr)"] {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
