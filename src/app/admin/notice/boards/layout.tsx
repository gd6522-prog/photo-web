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
  const isCalendarActive = pathname === "/admin/notice/calendar" || pathname.startsWith("/admin/notice/calendar/");
  const activeBoard = isCalendarActive ? null : getActiveBoard(pathname, searchParams);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 16, alignItems: "start" }} className="board-layout-grid">

      {/* ── 사이드바 ── */}
      <aside style={{
        background: "#fff",
        borderRadius: 14,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        padding: 16,
        display: "grid",
        gap: 20,
        position: "sticky",
        top: 88,
      }}>
        {/* 글쓰기 버튼 */}
        <Link
          href={`/admin/notice/boards/write?board=${activeBoard ?? "notice"}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 42, borderRadius: 8,
            background: "linear-gradient(135deg, #0e6b6b 0%, #0f766e 100%)",
            color: "#fff", fontWeight: 700, fontSize: 15,
            textDecoration: "none",
            boxShadow: "0 2px 8px rgba(14,107,107,0.25)",
          }}
        >
          글쓰기
        </Link>

        {/* 게시판 섹션 */}
        <section>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8, paddingLeft: 4 }}>
            게시판
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {NOTICE_BOARD_DEFS.map((board) => {
              const active = activeBoard === board.key;
              return (
                <Link
                  key={board.key}
                  href={`/admin/notice/boards?board=${board.key}`}
                  style={{
                    display: "block",
                    padding: "10px 14px",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    color: active ? "#0e6b6b" : "#333",
                    background: active ? "#e0f7f5" : "#fff",
                    border: active ? "1px solid #b2dfdb" : "1px solid #eee",
                    transition: "background 0.15s",
                  }}
                  className="sidebar-item"
                >
                  {board.label}
                </Link>
              );
            })}
          </div>
        </section>

        {/* 일정 관리 섹션 */}
        <section>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8, paddingLeft: 4 }}>
            일정 관리
          </div>
          <Link
            href="/admin/notice/calendar"
            style={{
              display: "block",
              padding: "10px 14px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: isCalendarActive ? 700 : 500,
              color: isCalendarActive ? "#0e6b6b" : "#333",
              background: isCalendarActive ? "#e0f7f5" : "#fff",
              border: isCalendarActive ? "1px solid #b2dfdb" : "1px solid #eee",
            }}
            className="sidebar-item"
          >
            일정 달력
          </Link>
        </section>
      </aside>

      {/* ── 메인 콘텐츠 ── */}
      <main>{children}</main>

      <style jsx>{`
        .sidebar-item:hover {
          background: #f0faf9 !important;
        }
        @media (max-width: 1000px) {
          .board-layout-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
