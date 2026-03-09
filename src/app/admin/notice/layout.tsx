"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MAX_W = 1700;

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const items = [
    { href: "/admin/notice/calendar", label: "일정 달력" },
    { href: "/admin/notice/boards?board=notice", label: "게시판" },
  ];

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px minmax(0, 1fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        <aside
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            background: "white",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 14, borderBottom: "1px solid #F3F4F6", fontWeight: 950 }}>게시판 관리</div>

          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href.replace(/\?.*/, "") + "/") || (it.href.includes("/boards") && pathname.startsWith("/admin/notice/boards"));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{
                    textDecoration: "none",
                    padding: "12px 12px",
                    borderRadius: 12,
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
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
