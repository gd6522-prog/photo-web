"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, isNoticeBoardKey, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";
import {
  boardCardStyle,
  boardGhostButtonStyle,
  boardInputStyle,
  boardPageShellStyle,
  boardPrimaryButtonStyle,
} from "./_board-theme";

type ListResponse = {
  ok?: boolean;
  message?: string;
  items?: NoticePost[];
  canManageAll?: boolean;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function BoardListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardParam = searchParams.get("board");
  const board: NoticeBoardKey = isNoticeBoardKey(boardParam) ? boardParam : "notice";
  const qParam = String(searchParams.get("q") ?? "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<NoticePost[]>([]);
  const [search, setSearch] = useState(qParam);
  const [pageSize, setPageSize] = useState(20);

  const boardDef = getNoticeBoardDef(board);

  useEffect(() => {
    setSearch(qParam);
  }, [qParam]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = String(data.session?.access_token ?? "").trim();
        if (!token) throw new Error("로그인 정보가 없습니다.");

        const params = new URLSearchParams({ board });
        if (qParam.trim()) params.set("q", qParam.trim());
        const res = await fetch(`/api/admin/notices/list?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as ListResponse;
        if (!res.ok || !json.ok) throw new Error(json.message || "게시글 조회 실패");
        setItems((json.items ?? []) as NoticePost[]);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "게시글 조회 실패");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [board, qParam]);

  const visibleItems = useMemo(() => items.slice(0, pageSize), [items, pageSize]);

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ board });
    if (search.trim()) params.set("q", search.trim());
    router.push(`/admin/notice/boards?${params.toString()}`);
  };

  return (
    <div style={boardPageShellStyle}>
      <section style={boardCardStyle}>
        <div style={{ padding: 20, borderBottom: "1px solid #d9e6ef", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.08, color: "#103b53" }}>{boardDef.label}</h1>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href={`/admin/notice/boards/write?board=${board}`} style={boardPrimaryButtonStyle}>
                글쓰기
              </Link>
              <Link href="/admin/notice/calendar" style={boardGhostButtonStyle}>
                일정
              </Link>
            </div>
          </div>
        </div>

        {err ? <div style={{ padding: 20, color: "#b42318", fontWeight: 800 }}>{err}</div> : null}

        <div style={{ padding: 20, display: "grid", gap: 18 }}>
          {loading ? (
            <div style={{ color: "#557186" }}>불러오는 중...</div>
          ) : visibleItems.length === 0 ? (
            <div
              style={{
                border: "1px solid #d9e6ef",
                borderRadius: 18,
                background: "#fbfdfe",
                padding: "28px 20px",
                display: "grid",
                gap: 14,
                justifyItems: "start",
              }}
            >
              <div style={{ color: "#557186" }}>등록된 게시글이 없습니다.</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/admin/notice/boards/write?board=${board}`} style={boardPrimaryButtonStyle}>
                  글쓰기
                </Link>
                <Link href="/admin/notice/calendar" style={boardGhostButtonStyle}>
                  일정
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px minmax(0, 1fr) 140px 120px",
                  gap: 12,
                  padding: "0 16px",
                  color: "#557186",
                  fontSize: 12,
                  fontWeight: 900,
                }}
                className="board-table-head"
              >
                <div>구분</div>
                <div>제목</div>
                <div>작성자</div>
                <div>작성일</div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {visibleItems.map((item) => {
                  const itemBoard = getNoticeBoardDef(item.board_key);
                  return (
                    <Link
                      key={item.id}
                      href={`/admin/notice/boards/${item.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "96px minmax(0, 1fr) 140px 120px",
                        gap: 12,
                        alignItems: "center",
                        padding: "16px",
                        borderRadius: 18,
                        border: item.is_pinned ? `1px solid ${itemBoard.tone.border}` : "1px solid #d9e6ef",
                        background: item.is_pinned ? "linear-gradient(135deg,#ffffff 0%,#f8fbfc 100%)" : "#ffffff",
                        textDecoration: "none",
                        color: "#103b53",
                        boxShadow: item.is_pinned ? "0 10px 24px rgba(16,59,83,0.08)" : "0 6px 16px rgba(2,32,46,0.04)",
                      }}
                      className="board-row"
                    >
                      <div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 58,
                            height: 28,
                            padding: "0 10px",
                            borderRadius: 999,
                            background: itemBoard.tone.bg,
                            color: itemBoard.tone.text,
                            border: `1px solid ${itemBoard.tone.border}`,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {item.is_pinned ? "고정" : itemBoard.shortLabel}
                        </span>
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div style={{ minWidth: 0, fontWeight: 950, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                          {item.is_pinned ? (
                            <span
                              style={{
                                flex: "0 0 auto",
                                padding: "3px 8px",
                                borderRadius: 999,
                                border: "1px solid #8dd3cc",
                                background: "#ecfdf5",
                                color: "#0f766e",
                                fontSize: 11,
                                fontWeight: 900,
                              }}
                            >
                              상단고정
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#557186", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.excerpt || item.body}
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: "#103b53", fontWeight: 800 }}>{item.author_name ?? "-"}</div>
                      <div style={{ fontSize: 13, color: "#557186", fontWeight: 800 }}>{formatDate(item.updated_at)}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <form
            onSubmit={onSearchSubmit}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto auto",
              gap: 10,
              alignItems: "center",
              paddingTop: 4,
            }}
            className="board-search-grid"
          >
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제목, 내용, 작성자 검색" style={boardInputStyle} />
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...boardInputStyle, width: 110 }}>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}개
                </option>
              ))}
            </select>
            <button type="submit" style={boardPrimaryButtonStyle}>
              조회
            </button>
          </form>
        </div>
      </section>

      <style jsx>{`
        .board-row {
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }
        .board-row:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 28px rgba(16, 59, 83, 0.1);
          border-color: #9fc0d3;
        }
        @media (max-width: 900px) {
          .board-table-head,
          .board-row,
          .board-search-grid {
            grid-template-columns: 1fr !important;
          }
          .board-table-head {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
