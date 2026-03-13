"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, type NoticePost } from "@/lib/notice-board";
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
        if (!token) throw new Error("로그인 세션이 없습니다.");
        const res = await fetch(`/api/admin/notices/item?id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; item?: NoticePost; canManageAll?: boolean };
        if (!res.ok || !json.ok) throw new Error(json.message || "게시글 조회 실패");
        setItem((json.item ?? null) as NoticePost | null);
        setCanManageAll(!!json.canManageAll);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "게시글 조회 실패");
        setItem(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) load();
  }, [id]);

  const onDelete = async () => {
    if (!item) return;
    if (!confirm("이 게시글을 삭제할까요?")) return;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) throw new Error("로그인 세션이 없습니다.");
      const res = await fetch("/api/admin/notices/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: item.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "삭제 실패");
      router.push(`/admin/notice/boards?board=${item.board_key}`);
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  if (loading) return <div style={{ color: "#557186" }}>불러오는 중...</div>;
  if (err) return <div style={{ color: "#b42318" }}>{err}</div>;
  if (!item) return <div style={{ color: "#b42318" }}>게시글을 찾지 못했습니다.</div>;

  const board = getNoticeBoardDef(item.board_key);

  return (
    <div style={boardPageShellStyle}>
      <section style={boardCardStyle}>
        <div style={{ padding: 22, borderBottom: "1px solid #d9e6ef", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "6px 12px", borderRadius: 999, background: board.tone.bg, color: board.tone.text, border: `1px solid ${board.tone.border}`, fontSize: 12, fontWeight: 900 }}>
                {board.label}
              </span>
              {item.is_pinned ? (
                <span style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #8dd3cc", background: "#ecfdf5", color: "#0f766e", fontSize: 12, fontWeight: 900 }}>
                  상단 고정
                </span>
              ) : null}
            </div>
            <h1 style={{ margin: "16px 0 0", fontSize: 38, lineHeight: 1.15, color: "#103b53", wordBreak: "break-word" }}>{item.title}</h1>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
        </div>
      </section>

      <section style={boardCardStyle}>
        <div style={{ padding: 22, borderBottom: "1px solid #d9e6ef", display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14, color: "#557186" }}>
          <span style={{ color: "#103b53", fontWeight: 900 }}>{item.author_name ?? "-"}</span>
          <span>{formatDateTime(item.updated_at)}</span>
        </div>
        <div style={{ padding: 22 }}>
          <div
            style={{
              minHeight: 380,
              border: "1px solid #d9e6ef",
              borderRadius: 18,
              background: "#fbfdfe",
              padding: "22px 20px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.9,
              color: "#103b53",
              fontSize: 16,
            }}
          >
            {item.body}
          </div>
        </div>
      </section>
    </div>
  );
}
