"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getNoticeBoardDef, isNoticeBoardKey, NOTICE_BOARD_DEFS, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";

type BoardFormProps = {
  mode: "create" | "edit";
  initialBoard: NoticeBoardKey;
  initialItem?: NoticePost | null;
};

export function BoardForm({ mode, initialBoard, initialItem }: BoardFormProps) {
  const router = useRouter();
  const [boardKey, setBoardKey] = useState<NoticeBoardKey>(initialItem?.board_key ?? initialBoard);
  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [body, setBody] = useState(initialItem?.body ?? "");
  const [isPinned, setIsPinned] = useState(!!initialItem?.is_pinned);
  const [canManageAll, setCanManageAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const loadRole = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = String(data.session?.access_token ?? "").trim();
        if (!token) return;
        const res = await fetch(`/api/admin/notices/list?board=${boardKey}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { canManageAll?: boolean };
        setCanManageAll(!!json.canManageAll);
      } catch {
        setCanManageAll(false);
      }
    };
    loadRole();
  }, [boardKey]);

  const boardDef = getNoticeBoardDef(boardKey);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageAll) {
      setErr("메인관리자만 게시글을 등록하거나 수정할 수 있습니다.");
      return;
    }
    if (!title.trim()) return setErr("제목을 입력해 주세요.");
    if (!body.trim()) return setErr("내용을 입력해 주세요.");

    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) throw new Error("로그인 세션이 없습니다.");

      const res = await fetch("/api/admin/notices/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: initialItem?.id,
          board_key: boardKey,
          title: title.trim(),
          body: body.trim(),
          is_pinned: isPinned,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "저장 실패");
      router.push(`/admin/notice/boards?board=${boardKey}`);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        border: "1px solid #D7E0E8",
        borderRadius: 18,
        background: "white",
        boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 20, borderBottom: "1px solid #EEF2F6" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, color: "#0F172A" }}>{mode === "create" ? "게시글 작성" : "게시글 수정"}</h1>
            <div style={{ marginTop: 8, fontSize: 13, color: "#64748B" }}>{boardDef.description}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: 20, display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 6 }}>게시판</div>
          <select
            value={boardKey}
            onChange={(e) => {
              const next = e.target.value;
              if (isNoticeBoardKey(next)) setBoardKey(next);
            }}
            style={{ width: "100%", height: 42, borderRadius: 12, border: "1px solid #CBD5E1", padding: "0 12px", fontWeight: 800 }}
          >
            {NOTICE_BOARD_DEFS.map((board) => (
              <option key={board.key} value={board.key}>
                {board.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 6 }}>제목</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", height: 42, borderRadius: 12, border: "1px solid #CBD5E1", padding: "0 12px", fontWeight: 700 }} />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 6 }}>내용</div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} style={{ width: "100%", borderRadius: 14, border: "1px solid #CBD5E1", padding: 14, fontWeight: 600, resize: "vertical", lineHeight: 1.7 }} />
        </div>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, color: "#0F172A" }}>
          <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
          상단 고정
        </label>

        {err ? <div style={{ color: "#B91C1C", fontWeight: 800 }}>{err}</div> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.back()} style={{ height: 42, padding: "0 16px", borderRadius: 12, border: "1px solid #CBD5E1", background: "white", fontWeight: 900, cursor: "pointer" }}>
            취소
          </button>
          <button type="submit" disabled={loading || !canManageAll} style={{ height: 42, padding: "0 16px", borderRadius: 12, border: "1px solid #0F172A", background: loading ? "#CBD5E1" : "#0F172A", color: "white", fontWeight: 900, cursor: loading || !canManageAll ? "not-allowed" : "pointer" }}>
            {loading ? "저장 중..." : mode === "create" ? "등록" : "수정 저장"}
          </button>
        </div>
      </div>
    </form>
  );
}
