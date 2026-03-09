"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, isNoticeBoardKey, NOTICE_BOARD_DEFS, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";

type ListResponse = {
  ok?: boolean;
  message?: string;
  items?: NoticePost[];
  canManageAll?: boolean;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function BoardListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardParam = searchParams.get("board");
  const board = isNoticeBoardKey(boardParam) ? boardParam : "notice";
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
        if (!token) throw new Error("로그인 세션이 없습니다.");

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
    <div
      style={{
        border: "1px solid #D7E0E8",
        borderRadius: 18,
        background: "white",
        boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 20, borderBottom: "1px solid #EEF2F6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: "#0F172A" }}>{boardDef.label}</h1>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: boardDef.tone.bg,
                  color: boardDef.tone.text,
                  border: `1px solid ${boardDef.tone.border}`,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                총 {items.length}건
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#64748B" }}>{boardDef.description}</div>
          </div>

          <form onSubmit={onSearchSubmit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={board}
              onChange={(e) => router.push(`/admin/notice/boards?board=${e.target.value}`)}
              style={{ height: 36, borderRadius: 10, border: "1px solid #CBD5E1", padding: "0 10px", fontWeight: 700 }}
            >
              {NOTICE_BOARD_DEFS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목, 내용, 작성자 검색"
              style={{ height: 36, minWidth: 240, borderRadius: 10, border: "1px solid #CBD5E1", padding: "0 12px" }}
            />
            <button
              type="submit"
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #0F172A",
                background: "#0F172A",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              조회
            </button>
          </form>
        </div>
      </div>

      {err ? <div style={{ padding: 20, color: "#B91C1C", fontWeight: 800 }}>{err}</div> : null}

      <div style={{ padding: 20 }}>
        {loading ? (
          <div style={{ color: "#64748B" }}>불러오는 중...</div>
        ) : visibleItems.length === 0 ? (
          <div style={{ color: "#64748B" }}>등록된 게시글이 없습니다.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Link href={`/admin/notice/boards/write?board=${board}`} style={{ textDecoration: "none", color: "#0F172A", fontWeight: 900 }}>
                새글쓰기
              </Link>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ height: 32, borderRadius: 8, border: "1px solid #CBD5E1", padding: "0 8px" }}>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px minmax(0,1fr) 140px 110px",
                  gap: 12,
                  padding: "12px 16px",
                  background: "#F8FAFC",
                  borderBottom: "1px solid #E2E8F0",
                  color: "#334155",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                <div>구분</div>
                <div>제목</div>
                <div>작성자</div>
                <div>작성일</div>
              </div>

              {visibleItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/notice/boards/${item.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px minmax(0,1fr) 140px 110px",
                    gap: 12,
                    padding: "14px 16px",
                    textDecoration: "none",
                    color: "#0F172A",
                    borderTop: "1px solid #F1F5F9",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 54,
                        height: 26,
                        padding: "0 10px",
                        borderRadius: 999,
                        background: boardDef.tone.bg,
                        color: boardDef.tone.text,
                        border: `1px solid ${boardDef.tone.border}`,
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {item.is_pinned ? "고정" : boardDef.shortLabel}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.excerpt || item.body}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "#334155", fontWeight: 700 }}>{item.author_name ?? "-"}</div>
                  <div style={{ fontSize: 13, color: "#64748B", fontWeight: 700 }}>{new Date(item.updated_at).toLocaleDateString("ko-KR")}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
