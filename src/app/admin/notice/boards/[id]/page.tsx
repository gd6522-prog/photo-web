"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, noticeBodyToHtml, type NoticePost } from "@/lib/notice-board";
import {
  boardDangerButtonStyle,
  boardGhostButtonStyle,
  boardPageShellStyle,
  boardPrimaryButtonStyle,
} from "../_board-theme";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "#8fa9bc", fontSize: 15, fontWeight: 600 }}>
        불러오는 중...
      </div>
    );
  }
  if (err) {
    return (
      <div style={{ padding: "16px 20px", borderRadius: 12, background: "#fff5f5", border: "1px solid #fecaca", color: "#b42318", fontWeight: 700 }}>
        {err}
      </div>
    );
  }
  if (!item) {
    return (
      <div style={{ padding: "16px 20px", borderRadius: 12, background: "#fff5f5", border: "1px solid #fecaca", color: "#b42318", fontWeight: 700 }}>
        게시글을 찾지 못했습니다.
      </div>
    );
  }

  const board = getNoticeBoardDef(item.board_key);
  const showUpdated = isUpdated(item.created_at, item.updated_at);
  const dateLabel = showUpdated ? "수정" : "작성";
  const dateValue = showUpdated ? item.updated_at : item.created_at;

  return (
    <div style={boardPageShellStyle}>

      {/* 라이트박스 */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "92vw", maxHeight: "92vh",
              objectFit: "contain",
              borderRadius: 12,
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
            }}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            style={{
              position: "fixed", top: 20, right: 24,
              background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10, color: "#fff", fontSize: 20,
              width: 40, height: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 헤더 배너 ── */}
      <div
        style={{
          borderRadius: 20,
          background: "linear-gradient(135deg, #0c2d42 0%, #103b53 50%, #0f4f47 100%)",
          padding: "32px 32px 28px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(10,40,60,0.22)",
        }}
      >
        {/* 배경 장식 */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: -50, right: -50, width: 220, height: 220,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(15,118,110,0.3) 0%, transparent 70%)",
          }} />
        </div>

        {/* 카테고리 배지 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, position: "relative", flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", padding: "5px 12px",
            borderRadius: 20, fontSize: 12, fontWeight: 800,
            background: "rgba(255,255,255,0.12)", color: "rgba(200,230,240,0.9)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}>
            {board.label}
          </span>
          {item.is_pinned && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px",
              borderRadius: 20, fontSize: 12, fontWeight: 800,
              background: "rgba(15,118,110,0.3)", color: "#6ee7b7",
              border: "1px solid rgba(15,118,110,0.4)",
            }}>
              📌 상단 고정
            </span>
          )}
        </div>

        {/* 제목 */}
        <h1 style={{
          margin: "0 0 20px",
          fontSize: 26, fontWeight: 900, color: "#ffffff",
          lineHeight: 1.4, wordBreak: "break-word",
          position: "relative",
        }}>
          {item.title}
        </h1>

        {/* 작성자 / 날짜 / 버튼 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap", position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 14px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}>
              <span style={{ fontSize: 16 }}>👤</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e0f2fe" }}>
                {item.author_name ?? "-"}
              </span>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, color: "rgba(180,215,230,0.8)", fontWeight: 600,
            }}>
              <span style={{ fontSize: 14 }}>🕐</span>
              <span>{dateLabel} {formatDateTime(dateValue)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/admin/notice/boards?board=${item.board_key}`} style={boardGhostButtonStyle}>
              ← 목록
            </Link>
            {canManageAll && (
              <>
                <Link href={`/admin/notice/boards/${item.id}/edit`} style={boardPrimaryButtonStyle}>
                  수정
                </Link>
                <button onClick={onDelete} style={boardDangerButtonStyle}>
                  삭제
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div style={{
        borderRadius: 20,
        background: "#ffffff",
        border: "1px solid #e2ecf4",
        boxShadow: "0 4px 24px rgba(2,32,46,0.06)",
        overflow: "hidden",
      }}>
        <div
          className="notice-body-html"
          style={{
            padding: "36px 40px",
            color: "#1a3344",
            fontSize: 15,
            lineHeight: 1.95,
            minHeight: 300,
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG" && target.getAttribute("data-notice-image") === "1") {
              setLightboxSrc((target as HTMLImageElement).src);
            }
          }}
          dangerouslySetInnerHTML={{ __html: bodyHtml || "<p></p>" }}
        />
      </div>

      <style jsx>{`
        .notice-body-html :global(p) {
          margin: 0 0 18px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .notice-body-html :global(h1),
        .notice-body-html :global(h2),
        .notice-body-html :global(h3),
        .notice-body-html :global(h4) {
          margin: 32px 0 14px;
          color: #0f2d3f;
          line-height: 1.45;
          font-weight: 900;
        }
        .notice-body-html :global(h1) { font-size: 24px; }
        .notice-body-html :global(h2) { font-size: 21px; }
        .notice-body-html :global(h3) { font-size: 18px; }
        .notice-body-html :global(ul),
        .notice-body-html :global(ol) {
          margin: 0 0 18px;
          padding-left: 22px;
        }
        .notice-body-html :global(li) { margin-bottom: 6px; }
        .notice-body-html :global(table) {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 14px;
          border-radius: 10px;
          overflow: hidden;
        }
        .notice-body-html :global(th),
        .notice-body-html :global(td) {
          border: 1px solid #e2ecf4;
          padding: 11px 14px;
          text-align: left;
          vertical-align: top;
        }
        .notice-body-html :global(th) {
          background: #f0f6fa;
          color: #103b53;
          font-weight: 900;
        }
        .notice-body-html :global([data-notice-image-wrapper='1']) {
          display: inline-block;
          max-width: 100%;
          margin: 20px 0;
          vertical-align: top;
        }
        .notice-body-html :global(img[data-notice-image='1']) {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          border: 1px solid #e2ecf4;
          background: #f5f9fc;
          cursor: zoom-in;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .notice-body-html :global(img[data-notice-image='1']:hover) {
          transform: scale(1.01);
          box-shadow: 0 8px 32px rgba(16,59,83,0.14);
        }
        @media (max-width: 640px) {
          .notice-body-html {
            padding: 24px 20px !important;
            font-size: 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
