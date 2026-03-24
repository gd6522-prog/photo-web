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
        if (!res.ok || !json.ok) throw new Error(json.message || "게시글 조회에 실패했습니다.");
        setItems((json.items ?? []) as NoticePost[]);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "게시글 조회에 실패했습니다.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
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
        <div style={{ padding: 20, borderBottom: "1px solid #d9e6ef", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.08, color: "#103b53" }}>{boardDef.label}</h1>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/admin/notice/boards/write?board=${board}`} style={boardPrimaryButtonStyle}>
              글쓰기
            </Link>
            <Link href="/admin/notice/calendar" style={boardGhostButtonStyle}>
              일정
            </Link>
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
                borderRadius: 12,
                background: "#ffffff",
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
            <div style={{ border: "1px solid #dde6ee", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
              <div
                className="board-table-head"
                style={{
                  display: "grid",
                  gridTemplateColumns: "88px minmax(0, 1fr) 140px 120px",
                  alignItems: "center",
                  minHeight: 44,
                  padding: "0 18px",
                  borderBottom: "1px solid #dde6ee",
                  background: "#fbfcfd",
                  color: "#355468",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                <div>구분</div>
                <div>제목</div>
                <div>작성자</div>
                <div>작성일</div>
              </div>

              <div>
                {visibleItems.map((item, index) => {
                  const itemBoard = getNoticeBoardDef(item.board_key);
                  return (
                    <Link
                      key={item.id}
                      href={`/admin/notice/boards/${item.id}`}
                      className="board-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "88px minmax(0, 1fr) 140px 120px",
                        alignItems: "center",
                        minHeight: 40,
                        padding: "0 18px",
                        textDecoration: "none",
                        color: "#103b53",
                        borderBottom: index === visibleItems.length - 1 ? "none" : "1px solid #eef3f6",
                        background: "#ffffff",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 46,
                            height: 24,
                            padding: "0 8px",
                            borderRadius: 999,
                            background: itemBoard.tone.bg,
                            color: itemBoard.tone.text,
                            border: `1px solid ${itemBoard.tone.border}`,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {item.is_pinned ? "공지" : itemBoard.shortLabel}
                        </span>
                      </div>
                      <div style={{ minWidth: 0, fontSize: 14, fontWeight: item.is_pinned ? 900 : 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 13, color: "#103b53", fontWeight: 700 }}>{item.author_name ?? "-"}</div>
                      <div style={{ fontSize: 13, color: "#557186", fontWeight: 700 }}>{formatDate(item.updated_at)}</div>
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
            }}
            className="board-search-grid"
          >
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제목, 작성자 검색" style={boardInputStyle} />
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
          transition: background-color 0.15s ease;
        }
        .board-row:hover {
          background: #f8fbfd !important;
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
          .board-row {
            gap: 6px;
            padding: 12px 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
