"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { BoardForm } from "../../_board-form";
import type { NoticePost } from "@/lib/notice-board";

export default function BoardEditPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const [item, setItem] = useState<NoticePost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = String(data.session?.access_token ?? "").trim();
        if (!token) throw new Error("로그인 세션이 없습니다.");
        const res = await fetch(`/api/admin/notices/item?id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { item?: NoticePost };
        setItem((json.item ?? null) as NoticePost | null);
      } catch {
        setItem(null);
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  if (loading) return <div style={{ color: "#64748B" }}>불러오는 중...</div>;
  if (!item) return <div style={{ color: "#B91C1C" }}>게시글을 찾지 못했습니다.</div>;
  return <BoardForm mode="edit" initialBoard={item.board_key} initialItem={item} />;
}
