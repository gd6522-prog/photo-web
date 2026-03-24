"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, noticeBodyToHtml, type NoticePost } from "@/lib/notice-board";
import {
  boardCardStyle,
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

  const bodyHtml = useMemo(() => noticeBodyToHtml(item?.body ?? ""), [item?.body]);

  if (loading) return <div style={{ color: "#557186" }}>불러오는 중...</div>;
  if (err) return <div style={{ color: "#b42318" }}>{err}</div>;
  if (!item) return <div style={{ color: "#b42318" }}>게시글을 찾지 못했습니다.</div>;

  const board = getNoticeBoardDef(item.board_key);
  const showUpdated = isUpdated(item.created_at, item.updated_at);
  const dateLabel = showUpdated ? "수정일" : "작성일";
  const dateValue = showUpdated ? item.updated_at : item.created_at;

  return (
    <div style={boardPageShellStyle}>
      <section style={boardCardStyle}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #d9e6ef", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "5px 10px", borderRadius: 999, background: board.tone.bg, color: board.tone.text, border: `1px solid ${board.tone.border}`, fontSize: 12, fontWeight: 900 }}>
                {board.label}
              </span>
              {item.is_pinned ? (
                <span style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid #8dd3cc", background: "#ecfdf5", color: "#0f766e", fontSize: 12, fontWeight: 900 }}>
                  상단 고정
                </span>
              ) : null}
            </div>

            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.35, color: "#103b53", fontWeight: 900, wordBreak: "break-word" }}>{item.title}</h1>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", color: "#557186", fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: "#103b53", fontWeight: 900 }}>{item.author_name ?? "-"}</span>
            </div>
          </div>

          <div style={{ display: "grid", justifyItems: "end", gap: 10, minWidth: 160 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link href={`/admin/notice/boards?board=${item.board_key}`} style={boardGhostButtonStyle}>
                목록
              </Link>
              {canManageAll ? (
                <>
                  <Link href={`/admin/notice/boards/${item.id}/edit`} style={boardPrimaryButtonStyle}>
                    수정
                  </Link>
                  <button onClick={onDelete} style={boardDangerButtonStyle}>
                    삭제
                  </button>
                </>
              ) : null}
            </div>
            <div style={{ color: "#557186", fontSize: 13, fontWeight: 700, textAlign: "right" }}>
              {dateLabel} {formatDateTime(dateValue)}
            </div>
          </div>
        </div>

        <div style={{ padding: 22 }}>
          <div
            className="notice-body-html"
            style={{
              minHeight: 380,
              border: "1px solid #e3ebf2",
              borderRadius: 14,
              background: "#ffffff",
              padding: "28px 26px",
              color: "#223f52",
              fontSize: 15,
              lineHeight: 1.9,
            }}
            dangerouslySetInnerHTML={{ __html: bodyHtml || "<p></p>" }}
          />
        </div>
      </section>

      <style jsx>{`
        .notice-body-html :global(p) {
          margin: 0 0 16px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .notice-body-html :global(h1),
        .notice-body-html :global(h2),
        .notice-body-html :global(h3),
        .notice-body-html :global(h4) {
          margin: 28px 0 12px;
          color: #103b53;
          line-height: 1.45;
        }
        .notice-body-html :global(h1) {
          font-size: 24px;
        }
        .notice-body-html :global(h2) {
          font-size: 21px;
        }
        .notice-body-html :global(h3) {
          font-size: 18px;
        }
        .notice-body-html :global(ul),
        .notice-body-html :global(ol) {
          margin: 0 0 18px;
          padding-left: 22px;
        }
        .notice-body-html :global(li) {
          margin-bottom: 6px;
        }
        .notice-body-html :global(table) {
          width: 100%;
          border-collapse: collapse;
          margin: 18px 0;
          font-size: 14px;
        }
        .notice-body-html :global(th),
        .notice-body-html :global(td) {
          border: 1px solid #d9e6ef;
          padding: 10px 12px;
          text-align: left;
          vertical-align: top;
        }
        .notice-body-html :global(th) {
          background: #f5f9fc;
          color: #103b53;
          font-weight: 900;
        }
        .notice-body-html :global([data-notice-image-wrapper='1']) {
          display: inline-block;
          max-width: 100%;
          margin: 18px 0;
          vertical-align: top;
        }
        .notice-body-html :global(img[data-notice-image='1']) {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          border-radius: 14px;
          border: 1px solid #d9e6ef;
          background: #fff;
        }
        @media (max-width: 900px) {
          .notice-body-html {
            padding: 20px 16px !important;
            font-size: 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
