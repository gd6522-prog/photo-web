"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, type NoticePost } from "@/lib/notice-board";

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

  if (loading) return <div style={{ color: "#64748B" }}>불러오는 중...</div>;
  if (err) return <div style={{ color: "#B91C1C" }}>{err}</div>;
  if (!item) return <div style={{ color: "#B91C1C" }}>게시글을 찾지 못했습니다.</div>;

  const board = getNoticeBoardDef(item.board_key);

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
      <div style={{ padding: 24, borderBottom: "1px solid #EEF2F6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 10px", borderRadius: 999, background: board.tone.bg, color: board.tone.text, border: `1px solid ${board.tone.border}`, fontSize: 12, fontWeight: 900 }}>
                {board.label}
              </span>
              {item.is_pinned ? <span style={{ fontSize: 12, fontWeight: 900, color: "#0F766E" }}>상단 고정</span> : null}
            </div>
            <h1 style={{ margin: "14px 0 10px", fontSize: 38, lineHeight: 1.15, color: "#0F172A" }}>{item.title}</h1>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "#64748B", fontSize: 14 }}>
              <span style={{ color: "#0F172A", fontWeight: 900 }}>{item.author_name ?? "-"}</span>
              <span>{new Date(item.updated_at).toLocaleString("ko-KR")}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/admin/notice/boards?board=${item.board_key}`} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #CBD5E1", background: "white", color: "#0F172A", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 900 }}>
              목록
            </Link>
            {canManageAll ? (
              <>
                <Link href={`/admin/notice/boards/${item.id}/edit`} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #CBD5E1", background: "white", color: "#0F172A", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 900 }}>
                  수정
                </Link>
                <button onClick={onDelete} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", fontWeight: 900, cursor: "pointer" }}>
                  삭제
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ padding: 24, minHeight: 420, whiteSpace: "pre-wrap", lineHeight: 1.8, color: "#111827", fontSize: 16 }}>{item.body}</div>
    </div>
  );
}
