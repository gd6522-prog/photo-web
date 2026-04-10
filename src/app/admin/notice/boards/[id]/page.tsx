"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, noticeBodyToHtml, type NoticePost } from "@/lib/notice-board";

function formatDateTime(value: string) {
  const d = new Date(value);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}(${wd}) ${hh}:${mm}`;
}

function isUpdated(createdAt: string, updatedAt: string) {
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000;
}

export default function BoardDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const [item, setItem] = useState<NoticePost | null>(null);
  const [canManageAll, setCanManageAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = String(data.session?.access_token ?? "").trim();
        if (!token) throw new Error("로그인 정보가 없습니다.");

        const res = await fetch(`/api/admin/notices/item?id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; item?: NoticePost; canManageAll?: boolean };
        if (!res.ok || !json.ok) throw new Error(json.message || "게시글 조회에 실패했습니다.");
        setItem((json.item ?? null) as NoticePost | null);
        setCanManageAll(!!json.canManageAll);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "게시글 조회에 실패했습니다.");
        setItem(null);
      } finally {
        setLoading(false);
      }
    };
    if (id) void load();
  }, [id]);

  const onDelete = async () => {
    if (!item) return;
    if (!confirm("이 게시글을 삭제할까요?")) return;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) throw new Error("로그인 정보가 없습니다.");
      const res = await fetch("/api/admin/notices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: item.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "삭제에 실패했습니다.");
      router.push(`/admin/notice/boards?board=${item.board_key}`);
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const bodyHtml = useMemo(() => {
    const html = noticeBodyToHtml(item?.body ?? "");
    return html.replace(
      /https?:\/\/pub-[a-f0-9]+\.r2\.dev\/([^"'<\s]+)/g,
      (_, key) => `/api/r2/image?key=${encodeURIComponent(key)}`
    );
  }, [item?.body]);

  if (loading) return <div style={{ padding: 40, color: "#888", fontSize: 14 }}>불러오는 중...</div>;
  if (err) return <div style={{ padding: "12px 16px", color: "#b42318", fontWeight: 700, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 4 }}>{err}</div>;
  if (!item) return <div style={{ padding: "12px 16px", color: "#b42318", fontWeight: 700 }}>게시글을 찾지 못했습니다.</div>;

  const board = getNoticeBoardDef(item.board_key);
  const showUpdated = isUpdated(item.created_at, item.updated_at);
  const dateValue = showUpdated ? item.updated_at : item.created_at;

  return (
    <div style={{ background: "#fff", border: "1px solid #dde6ee", borderRadius: 4, overflow: "hidden" }}>

      {/* 라이트박스 */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxSrc} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }} />
          <button onClick={() => setLightboxSrc(null)} style={{ position: "fixed", top: 20, right: 24, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6, color: "#fff", fontSize: 18, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ── 상단 툴바 ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", borderBottom: "1px solid #dde6ee", background: "#fafbfc", flexWrap: "wrap", gap: 6 }}>
        {/* 좌측 버튼들 */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Link href={`/admin/notice/boards/write?board=${item.board_key}`} style={toolBtn}>
            ✏ 새글쓰기
          </Link>
          {canManageAll && (
            <>
              <span style={divider} />
              <Link href={`/admin/notice/boards/${item.id}/edit`} style={toolBtn}>
                ✎ 수정
              </Link>
              <span style={divider} />
              <button onClick={onDelete} style={{ ...toolBtn, color: "#b42318" }}>
                🗑 삭제
              </button>
            </>
          )}
        </div>
        {/* 우측 버튼들 */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button style={toolBtn} onClick={() => history.go(-1)}>↑ 위</button>
          <span style={divider} />
          <button style={toolBtn} onClick={() => history.go(1)}>↓ 아래</button>
          <span style={divider} />
          <button style={toolBtn} onClick={() => { void navigator.clipboard?.writeText(window.location.href); }}>🔗 URL복사</button>
          <span style={divider} />
          <Link href={`/admin/notice/boards?board=${item.board_key}`} style={toolBtn}>≡ 목록</Link>
          <span style={divider} />
          <button style={toolBtn} onClick={() => window.print()}>🖨 인쇄</button>
        </div>
      </div>

      {/* ── 제목 행 ── */}
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #eef2f6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {item.is_pinned && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 2, background: "#fff0f0", color: "#e03131", border: "1px solid #ffc9c9", whiteSpace: "nowrap" }}>
              공지
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 2, background: board.tone.bg, color: board.tone.text, border: `1px solid ${board.tone.border}`, whiteSpace: "nowrap" }}>
            {board.shortLabel}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111", wordBreak: "break-word" }}>
            {item.title}
          </span>
          <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>[0]</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 2, background: "#e8f4fd", color: "#1a6fbd", border: "1px solid #bee3f8", whiteSpace: "nowrap", cursor: "pointer" }}>
            ✦ AI요약
          </span>
        </div>
      </div>

      {/* ── 작성자 정보 ── */}
      <div style={{ padding: "8px 18px", borderBottom: "1px solid #eef2f6", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#d0e8f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
          👤
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>{item.author_name ?? "-"}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{formatDateTime(dateValue)}</div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div
        className="notice-body-html"
        style={{ padding: "28px 24px", minHeight: 280, color: "#222", fontSize: 14, lineHeight: 1.9 }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "IMG" && target.getAttribute("data-notice-image") === "1") {
            setLightboxSrc((target as HTMLImageElement).src);
          }
        }}
        dangerouslySetInnerHTML={{ __html: bodyHtml || "<p></p>" }}
      />

      {/* ── 하단 정보 ── */}
      <div style={{ padding: "10px 18px", borderTop: "1px solid #eef2f6", display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#888" }}>
        <span>👁 조회 {item.view_count ?? 0}</span>
      </div>

      <style jsx>{`
        .notice-body-html :global(p) { margin: 0 0 16px; white-space: pre-wrap; word-break: break-word; }
        .notice-body-html :global(h1), .notice-body-html :global(h2),
        .notice-body-html :global(h3), .notice-body-html :global(h4) {
          margin: 28px 0 12px; color: #111; font-weight: 700; line-height: 1.45;
        }
        .notice-body-html :global(h1) { font-size: 22px; }
        .notice-body-html :global(h2) { font-size: 19px; }
        .notice-body-html :global(h3) { font-size: 16px; }
        .notice-body-html :global(ul), .notice-body-html :global(ol) { margin: 0 0 16px; padding-left: 22px; }
        .notice-body-html :global(li) { margin-bottom: 4px; }
        .notice-body-html :global(table) { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        .notice-body-html :global(th), .notice-body-html :global(td) { border: 1px solid #dde6ee; padding: 8px 12px; text-align: left; vertical-align: top; }
        .notice-body-html :global(th) { background: #f5f7f9; font-weight: 700; color: #333; }
        .notice-body-html :global(a) { color: #1a6fbd; }
        .notice-body-html :global([data-notice-image-wrapper='1']) { display: inline-block; max-width: 100%; margin: 14px 0; vertical-align: top; }
        .notice-body-html :global(img[data-notice-image='1']) { display: block; max-width: 100%; height: auto; border: 1px solid #dde6ee; background: #fff; cursor: zoom-in; }
        @media (max-width: 640px) {
          .notice-body-html { padding: 20px 14px !important; font-size: 13px !important; }
        }
      `}</style>
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  height: 26,
  padding: "0 8px",
  border: "none",
  background: "none",
  fontSize: 12,
  color: "#444",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  textDecoration: "none",
  whiteSpace: "nowrap",
  borderRadius: 2,
};

const divider: React.CSSProperties = {
  display: "inline-block",
  width: 1,
  height: 12,
  background: "#ddd",
  margin: "0 2px",
};
