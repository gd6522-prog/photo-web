"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NOTICE_BOARD_DEFS, type NoticeBoardKey } from "@/lib/notice-board";

function getActiveBoard(pathname: string, searchParams: URLSearchParams): NoticeBoardKey {
  const fromQuery = searchParams.get("board");
  if (NOTICE_BOARD_DEFS.some((board) => board.key === fromQuery)) return fromQuery as NoticeBoardKey;
  if (pathname.includes("/operation")) return "operation";
  if (pathname.includes("/transport")) return "transport";
  if (pathname.includes("/safety")) return "safety";
  return "notice";
}

export default function BoardsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeBoard = getActiveBoard(pathname, searchParams);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "250px minmax(0, 1fr)",
        gap: 16,
        alignItems: "start",
      }}
    >
      <aside
        style={{
          border: "1px solid #D7E0E8",
          borderRadius: 18,
          background: "white",
          boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
          overflow: "hidden",
          position: "sticky",
          top: 88,
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid #EEF2F6" }}>
          <Link
            href={`/admin/notice/boards/write?board=${activeBoard}`}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 48,
              borderRadius: 12,
              border: "1px solid #CAD5E2",
              color: "#0F172A",
              textDecoration: "none",
              fontWeight: 900,
              background: "#F8FAFC",
            }}
          >
            글쓰기
          </Link>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#64748B", marginBottom: 10 }}>전사게시판</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {NOTICE_BOARD_DEFS.map((board) => {
              const active = activeBoard === board.key;
              return (
                <Link
                  key={board.key}
                  href={`/admin/notice/boards?board=${board.key}`}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    textDecoration: "none",
                    background: active ? "#EEF6FF" : "transparent",
                    border: active ? "1px solid #BFDBFE" : "1px solid transparent",
                    color: active ? "#0F172A" : "#1E293B",
                    fontWeight: active ? 900 : 700,
                  }}
                >
                  {board.label}
                </Link>
              );
            })}
          </div>
        </div>
      </aside>

      <main>{children}</main>
    </div>
  );
}
