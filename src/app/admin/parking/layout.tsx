"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/parking", label: "신청 관리" },
  { href: "/admin/parking/io-history", label: "입출차 내역" },
];

export default function ParkingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                border: active ? "none" : "1px solid #cbd5e1",
                background: active ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)" : "#ffffff",
                color: active ? "#ffffff" : "#334155",
                fontWeight: 800,
                fontSize: 13,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
