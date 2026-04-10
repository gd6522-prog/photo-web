"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, isNoticeBoardKey, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";
import { boardPrimaryButtonStyle, boardGhostButtonStyle, boardInputStyle } from "./_board-theme";

type ListResponse = {
  ok?: boolean;
  message?: string;
  items?: NoticePost[];
  canManageAll?: boolean;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function formatDate(value: string) {
  const d = new Date(value);
  const yy = String(d.getFullYear()).slice(2);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${yy}.${month}.${day}`;
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
  const [infoOpen, setInfoOpen] = useState(true);

  useEffect(() => { setSearch(qParam); }, [qParam]);

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
  const pinnedItems = useMemo(() => visibleItems.filter((i) => i.is_pinned), [visibleItems]);
  const normalItems = useMemo(() => visibleItems.filter((i) => !i.is_pinned), [visibleItems]);

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ board });
    if (search.trim()) params.set("q", search.trim());
    router.push(`/admin/notice/boards?${params.toString()}`);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #dde6ee", borderRadius: 4, overflow: "hidden" }}>

      {/* ── 헤더 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: "1px solid #dde6ee",
        background: "#fff", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#222" }}>{boardDef.label}</span>
          <span style={{ fontSize: 13, color: "#555", fontWeight: 400 }}>
            (총 <strong style={{ color: "#222" }}>{items.length}</strong>건)
          </span>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16, padding: 0, lineHeight: 1 }}>☆</button>
        </div>
        <form onSubmit={onSearchSubmit} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select style={{ height: 28, border: "1px solid #ccc", borderRadius: 2, padding: "0 6px", fontSize: 13, color: "#333", background: "#fff" }}>
            <option>게시판</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색"
            style={{ height: 28, border: "1px solid #ccc", borderRadius: 2, padding: "0 8px", fontSize: 13, width: 160, outline: "none" }}
          />
          <select style={{ height: 28, border: "1px solid #ccc", borderRadius: 2, padding: "0 6px", fontSize: 13, color: "#333", background: "#fff" }}>
            <option>상세</option>
          </select>
          <button type="submit" style={{ height: 28, padding: "0 10px", border: "1px solid #bbb", borderRadius: 2, background: "#f5f5f5", fontSize: 13, cursor: "pointer", color: "#333" }}>
            🔍
          </button>
        </form>
      </div>


      {/* ── 게시판 정보 (접이식) ── */}
      <div style={{ borderBottom: "1px solid #dde6ee", background: "#fafbfc" }}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", cursor: "pointer", userSelect: "none" }}
          onClick={() => setInfoOpen((p) => !p)}
        >
          <span style={{ fontSize: 12, color: "#666" }}>게시판 정보</span>
          <span style={{ fontSize: 11, color: "#999" }}>{infoOpen ? "▲" : "▼"}</span>
        </div>
        {infoOpen && (
          <div style={{ padding: "0 16px 10px", fontSize: 13, color: "#444", display: "grid", gap: 4 }}>
            <div>
              <span style={{ color: "#888", marginRight: 4 }}>운영자 :</span>
              <span>{boardDef.label} 관리자</span>
            </div>
            <div style={{ color: "#777" }}>{boardDef.description}</div>
          </div>
        )}
      </div>

      {err && (
        <div style={{ padding: "10px 16px", color: "#b42318", fontWeight: 700, background: "#fff5f5", borderBottom: "1px solid #fecaca" }}>
          {err}
        </div>
      )}

      {/* ── 도구모음 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: "1px solid #dde6ee", background: "#fff",
      }}>
        <Link href={`/admin/notice/boards/write?board=${board}`} style={{
          height: 30, padding: "0 14px", border: "1px solid #555",
          borderRadius: 2, background: "#fff", fontSize: 13, fontWeight: 600,
          color: "#333", display: "inline-flex", alignItems: "center",
          textDecoration: "none", gap: 4,
        }}>
          ✏ 새글쓰기
        </Link>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          style={{ height: 28, border: "1px solid #ccc", borderRadius: 2, padding: "0 6px", fontSize: 13, color: "#333", background: "#fff" }}
        >
          {PAGE_SIZE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* ── 테이블 ── */}
      {loading ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#888", fontSize: 14 }}>불러오는 중...</div>
      ) : visibleItems.length === 0 ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "#888", fontSize: 14 }}>등록된 게시글이 없습니다.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f5f7f9", borderBottom: "1px solid #dde6ee" }}>
              {["번호", "제목", "작성자", "작성일", "조회"].map((h) => (
                <th key={h} style={{
                  padding: "10px 12px", fontSize: 14, fontWeight: 700,
                  color: "#444", textAlign: "center", borderRight: "1px solid #eee",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 고정 게시글 */}
            {pinnedItems.map((item) => {
              return (
                <tr key={item.id} className="board-row pinned-row" style={{ borderBottom: "1px solid #f0f0f0", background: "#fff" }}>
                  <td style={{ textAlign: "center", padding: "9px 6px" }}>
                    <span style={{ color: "#e03131", fontSize: 18, lineHeight: 1 }}>📢</span>
                  </td>
                  <td style={{ padding: "9px 12px", overflow: "hidden" }}>
                    <Link href={`/admin/notice/boards/${item.id}?board=${item.board_key}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 15, fontWeight: 700, color: "#cc4400",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {item.title}
                      </span>
                    </Link>
                  </td>
                  <td style={{ textAlign: "center", fontSize: 14, color: "#444", padding: "9px 6px" }}>{item.author_name ?? "-"}</td>
                  <td style={{ textAlign: "center", fontSize: 13, color: "#888", padding: "9px 6px" }}>{formatDate(item.updated_at)}</td>
                  <td style={{ textAlign: "center", fontSize: 13, color: "#888", padding: "9px 6px" }}>-</td>
                </tr>
              );
            })}
            {/* 일반 게시글 */}
            {normalItems.map((item, idx) => {
              const num = items.length - (pinnedItems.length + idx);
              return (
                <tr key={item.id} className="board-row" style={{ borderBottom: "1px solid #f0f0f0", background: "#fff" }}>
                  <td style={{ textAlign: "center", fontSize: 14, color: "#888", padding: "9px 6px" }}>{num}</td>
                  <td style={{ padding: "9px 12px", overflow: "hidden" }}>
                    <Link href={`/admin/notice/boards/${item.id}?board=${item.board_key}`} style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
                      <span style={{
                        fontSize: 15, fontWeight: 500, color: "#222",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {item.title}
                      </span>
                    </Link>
                  </td>
                  <td style={{ textAlign: "center", fontSize: 14, color: "#444", padding: "9px 6px" }}>{item.author_name ?? "-"}</td>
                  <td style={{ textAlign: "center", fontSize: 13, color: "#888", padding: "9px 6px" }}>{formatDate(item.updated_at)}</td>
                  <td style={{ textAlign: "center", fontSize: 13, color: "#888", padding: "9px 6px" }}>{item.view_count ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .board-row:hover td {
          background: #f5f9ff !important;
        }
        @media (max-width: 640px) {
          table colgroup col:nth-child(3),
          table colgroup col:nth-child(5),
          table colgroup col:nth-child(6),
          table thead tr th:nth-child(3),
          table thead tr th:nth-child(5),
          table thead tr th:nth-child(6),
          table tbody tr td:nth-child(3),
          table tbody tr td:nth-child(5),
          table tbody tr td:nth-child(6) {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
