"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, isNoticeBoardKey, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";
import {
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
  const pinnedItems = useMemo(() => visibleItems.filter((i) => i.is_pinned), [visibleItems]);
  const normalItems = useMemo(() => visibleItems.filter((i) => !i.is_pinned), [visibleItems]);

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ board });
    if (search.trim()) params.set("q", search.trim());
    router.push(`/admin/notice/boards?${params.toString()}`);
  };

  return (
    <div style={boardPageShellStyle}>

      {/* ── 헤더 배너 ── */}
      <div
        style={{
          borderRadius: 20,
          background: "linear-gradient(135deg, #0c2d42 0%, #103b53 50%, #0f4f47 100%)",
          padding: "32px 32px 28px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(10,40,60,0.22)",
        }}
      >
        {/* 배경 장식 */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: -60, right: -60, width: 260, height: 260,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(15,118,110,0.28) 0%, transparent 70%)",
          }} />
          <div style={{
            position: "absolute", bottom: -40, left: "30%", width: 180, height: 180,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(56,189,248,0.12) 0%, transparent 70%)",
          }} />
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(148,215,230,0.85)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            NOTICE BOARD
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#ffffff", letterSpacing: -0.5 }}>
            {boardDef.label}
          </h1>
          {items.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: "rgba(200,230,240,0.7)", fontWeight: 600 }}>
              총 {items.length}건
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, position: "relative", flexWrap: "wrap" }}>
          <Link href="/admin/notice/calendar" style={boardGhostButtonStyle}>
            📅 일정
          </Link>
          <Link href={`/admin/notice/boards/write?board=${board}`} style={boardPrimaryButtonStyle}>
            ✏️ 글쓰기
          </Link>
        </div>
      </div>

      {/* ── 검색 바 ── */}
      <form
        onSubmit={onSearchSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto auto",
          gap: 10,
          alignItems: "center",
          background: "#ffffff",
          borderRadius: 14,
          border: "1px solid #e2ecf4",
          padding: "14px 18px",
          boxShadow: "0 2px 12px rgba(2,32,46,0.05)",
        }}
        className="board-search-grid"
      >
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8fa9bc", fontSize: 15, pointerEvents: "none" }}>
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목, 작성자 검색..."
            style={{ ...boardInputStyle, paddingLeft: 36 }}
          />
        </div>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          style={{ ...boardInputStyle, width: 100 }}
        >
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

      {err && (
        <div style={{ padding: "16px 20px", borderRadius: 12, background: "#fff5f5", border: "1px solid #fecaca", color: "#b42318", fontWeight: 700 }}>
          {err}
        </div>
      )}

      {/* ── 목록 ── */}
      {loading ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 64, color: "#8fa9bc", fontSize: 15, fontWeight: 600,
          background: "#fff", borderRadius: 16, border: "1px solid #e2ecf4",
        }}>
          불러오는 중...
        </div>
      ) : visibleItems.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 64, gap: 16,
          background: "#fff", borderRadius: 16, border: "1px solid #e2ecf4",
        }}>
          <div style={{ fontSize: 40 }}>📋</div>
          <div style={{ color: "#8fa9bc", fontSize: 15, fontWeight: 600 }}>등록된 게시글이 없습니다.</div>
          <Link href={`/admin/notice/boards/write?board=${board}`} style={boardPrimaryButtonStyle}>
            첫 글 작성하기
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>

          {/* 고정 게시글 */}
          {pinnedItems.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#557186", letterSpacing: 1.2, textTransform: "uppercase", paddingLeft: 4 }}>
                📌 고정 게시글
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {pinnedItems.map((item) => (
                  <PostCard key={item.id} item={item} pinned />
                ))}
              </div>
            </div>
          )}

          {/* 일반 게시글 */}
          {normalItems.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {pinnedItems.length > 0 && (
                <div style={{ fontSize: 12, fontWeight: 800, color: "#557186", letterSpacing: 1.2, textTransform: "uppercase", paddingLeft: 4 }}>
                  전체 게시글
                </div>
              )}
              {normalItems.map((item, idx) => (
                <PostCard key={item.id} item={item} index={idx + 1 + pinnedItems.length} />
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @media (max-width: 640px) {
          .board-search-grid {
            grid-template-columns: 1fr 1fr !important;
          }
          .board-search-grid > :first-child {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}

function PostCard({ item, pinned = false, index }: { item: NoticePost; pinned?: boolean; index?: number }) {
  const [hovered, setHovered] = useState(false);
  const boardDef = getNoticeBoardDef(item.board_key);

  return (
    <Link
      href={`/admin/notice/boards/${item.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0,1fr) auto",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderRadius: 14,
        background: pinned
          ? "linear-gradient(135deg, #f0fdf9 0%, #ecfdf5 100%)"
          : hovered ? "#f7fbfe" : "#ffffff",
        border: pinned
          ? "1px solid #a7f3d0"
          : hovered ? "1px solid #bcd4e8" : "1px solid #e8f0f7",
        textDecoration: "none",
        transition: "all 0.18s ease",
        boxShadow: hovered
          ? "0 4px 20px rgba(16,59,83,0.1)"
          : pinned ? "0 2px 10px rgba(15,118,110,0.08)" : "0 1px 4px rgba(16,59,83,0.04)",
      }}
    >
      {/* 번호 / 배지 */}
      <div style={{ display: "flex", alignItems: "center", minWidth: 54 }}>
        {pinned ? (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg,#0f766e,#0891b2)",
            color: "#fff", fontSize: 16,
          }}>
            📌
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: "#f0f6fa",
            color: "#6b8fa8", fontSize: 13, fontWeight: 800,
          }}>
            {index}
          </span>
        )}
      </div>

      {/* 제목 + 메타 */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: "3px 10px", borderRadius: 20,
            background: boardDef.tone.bg, color: boardDef.tone.text,
            border: `1px solid ${boardDef.tone.border}`,
            fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
            whiteSpace: "nowrap",
          }}>
            {boardDef.shortLabel}
          </span>
          <span style={{
            fontSize: 15, fontWeight: pinned ? 900 : 700,
            color: "#0f2d3f",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: "100%",
          }}>
            {item.title}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#8fa9bc", fontWeight: 600 }}>
          {item.author_name ?? "-"}
        </div>
      </div>

      {/* 날짜 */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
        minWidth: 56,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: pinned ? "#0f766e" : "#6b8fa8",
        }}>
          {formatDate(item.updated_at)}
        </span>
        <span style={{ fontSize: 10, color: "#adc4d4", fontWeight: 600 }}>
          {new Date(item.updated_at).getFullYear()}
        </span>
      </div>
    </Link>
  );
}

function formatDate(value: string) {
  const d = new Date(value);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}
