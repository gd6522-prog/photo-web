"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NOTICE_BOARD_DEFS, type NoticeBoardKey } from "@/lib/notice-board";
import {
  boardCardStyle,
  boardPageShellStyle,
  boardPrimaryButtonStyle,
  boardSectionTitleStyle,
} from "./_board-theme";

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
  const isCalendarActive = pathname === "/admin/notice/calendar" || pathname.startsWith("/admin/notice/calendar/");

  return (
    <div style={boardPageShellStyle}>
      <div className="board-layout-grid" style={{ display: "grid", gridTemplateColumns: "290px minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <aside style={{ ...boardCardStyle, position: "sticky", top: 88 }}>
          <div style={{ padding: 18, borderBottom: "1px solid #d9e6ef" }}>
            <Link href={`/admin/notice/boards/write?board=${activeBoard}`} style={{ ...boardPrimaryButtonStyle, width: "100%", marginTop: 14 }}>
              글쓰기
            </Link>
          </div>

          <div style={{ padding: 18, display: "grid", gap: 18 }}>
            <section>
              <div style={{ ...boardSectionTitleStyle, fontSize: 13 }}>게시판</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {NOTICE_BOARD_DEFS.map((board) => {
                  const active = activeBoard === board.key;
                  return (
                    <Link
                      key={board.key}
                      href={`/admin/notice/boards?board=${board.key}`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 16,
                        textDecoration: "none",
                        border: active ? `1px solid ${board.tone.border}` : "1px solid #d9e6ef",
                        background: active ? board.tone.bg : "#fbfdfe",
                        color: active ? board.tone.text : "#103b53",
                        boxShadow: active ? "0 8px 18px rgba(16,59,83,0.10)" : "none",
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 14 }}>{board.label}</div>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section>
              <div style={{ ...boardSectionTitleStyle, fontSize: 13 }}>일정 관리</div>
              <Link
                href="/admin/notice/calendar"
                style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 16,
                  display: "block",
                  textDecoration: "none",
                  border: isCalendarActive ? "1px solid #7dd3fc" : "1px solid #d9e6ef",
                  background: isCalendarActive ? "#e0f2fe" : "#fbfdfe",
                  color: isCalendarActive ? "#075985" : "#103b53",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>일정 달력</div>
              </Link>
            </section>
          </div>
        </aside>

        <main>{children}</main>
      </div>

      <style jsx>{`
        @media (max-width: 1100px) {
          .board-layout-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
