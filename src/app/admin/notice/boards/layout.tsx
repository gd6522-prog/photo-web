"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NOTICE_BOARD_DEFS, type NoticeBoardKey } from "@/lib/notice-board";

function getActiveBoard(pathname: string, searchParams: URLSearchParams): NoticeBoardKey {
  const fromQuery = searchParams.get("board");
  if (NOTICE_BOARD_DEFS.some((board) => board.key === fromQuery)) return fromQuery as NoticeBoardKey;
  return "notice";
}

export default function BoardsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isCalendarActive = pathname === "/admin/notice/calendar" || pathname.startsWith("/admin/notice/calendar/");
  const activeBoard = isCalendarActive ? null : getActiveBoard(pathname, searchParams);

  return (
    <div
      className="board-layout-grid"
      style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 0, alignItems: "start" }}
    >
      {/* ── 사이드바 ── */}
      <aside style={{
        background: "#fff",
        borderRight: "1px solid #dde6ee",
        minHeight: "calc(100vh - 60px)",
        paddingBottom: 24,
        position: "sticky",
        top: 0,
      }}>
        {/* 글쓰기 버튼 */}
        <div style={{ padding: "12px 12px 8px" }}>
          <Link
            href={`/admin/notice/boards/write?board=${activeBoard ?? "notice"}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 36, borderRadius: 4,
              border: "1px solid #aaa",
              background: "#fff",
              color: "#222", fontWeight: 600, fontSize: 14,
              textDecoration: "none",
            }}
          >
            글쓰기
          </Link>
        </div>

        {/* 게시판 섹션 */}
        <div style={{ marginTop: 4 }}>
          {/* 섹션 헤더 */}
          <div style={{
            padding: "6px 14px",
            fontSize: 12, fontWeight: 700, color: "#555",
            display: "flex", alignItems: "center", gap: 4,
            cursor: "default",
          }}>
            <span style={{ fontSize: 10 }}>▼</span> 게시판
          </div>

          {NOTICE_BOARD_DEFS.map((board) => {
            const active = activeBoard === board.key;
            return (
              <Link
                key={board.key}
                href={`/admin/notice/boards?board=${board.key}`}
                className="sidebar-nav-item"
                style={{
                  display: "block",
                  padding: "6px 14px 6px 22px",
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  color: active ? "#111" : "#333",
                  background: active ? "#e8f4fd" : "transparent",
                  textDecoration: "none",
                  borderLeft: active ? "3px solid #1a6fbd" : "3px solid transparent",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {board.label}
              </Link>
            );
          })}
        </div>

        {/* 일정 관리 섹션 */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            padding: "6px 14px",
            fontSize: 12, fontWeight: 700, color: "#555",
            display: "flex", alignItems: "center", gap: 4,
            cursor: "default",
          }}>
            <span style={{ fontSize: 10 }}>▼</span> 일정 관리
          </div>
          <Link
            href="/admin/notice/calendar"
            className="sidebar-nav-item"
            style={{
              display: "block",
              padding: "6px 14px 6px 22px",
              fontSize: 13,
              fontWeight: isCalendarActive ? 700 : 400,
              color: isCalendarActive ? "#111" : "#333",
              background: isCalendarActive ? "#e8f4fd" : "transparent",
              textDecoration: "none",
              borderLeft: isCalendarActive ? "3px solid #1a6fbd" : "3px solid transparent",
            }}
          >
            일정 달력
          </Link>
        </div>
      </aside>

      {/* ── 메인 콘텐츠 ── */}
      <main style={{ minWidth: 0 }}>{children}</main>

      <style jsx>{`
        .sidebar-nav-item:hover {
          background: #f0f6fc !important;
          color: #111 !important;
        }
        @media (max-width: 900px) {
          .board-layout-grid {
            grid-template-columns: 1fr !important;
          }
          aside {
            min-height: unset !important;
            border-right: none !important;
            border-bottom: 1px solid #dde6ee !important;
          }
        }
      `}</style>
    </div>
  );
}
