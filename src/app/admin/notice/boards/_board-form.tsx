"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isNoticeBoardKey, NOTICE_BOARD_DEFS, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";
import {
  boardCardStyle,
  boardGhostButtonStyle,
  boardInputStyle,
  boardPageShellStyle,
  boardPrimaryButtonStyle,
  boardSectionTitleStyle,
  boardTextareaStyle,
} from "./_board-theme";

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
  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageAll) {
      setErr("메인 관리자만 게시글을 등록하거나 수정할 수 있습니다.");
      return;
    }
    if (!title.trim()) {
      setErr("제목을 입력해 주세요.");
      return;
    }
    if (!body.trim()) {
      setErr("내용을 입력해 주세요.");
      return;
    }

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
    <div style={boardPageShellStyle}>
      <form onSubmit={onSubmit} style={boardCardStyle}>
        <div style={{ padding: 22, borderBottom: "1px solid #d9e6ef", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.08, color: "#103b53" }}>{mode === "create" ? "글쓰기" : "수정"}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/admin/notice/boards?board=${boardKey}`} style={boardGhostButtonStyle}>
              목록
            </Link>
            <button type="button" onClick={() => router.back()} style={boardGhostButtonStyle}>
              취소
            </button>
          </div>
        </div>

        <div style={{ padding: 22, display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) 240px", gap: 14 }} className="board-form-top-grid">
            <section style={{ border: "1px solid #d9e6ef", borderRadius: 18, background: "#fbfdfe", padding: 18 }}>
              <div style={boardSectionTitleStyle}>게시판 선택</div>
              <select
                value={boardKey}
                onChange={(e) => {
                  const next = e.target.value;
                  if (isNoticeBoardKey(next)) setBoardKey(next);
                }}
                style={{ ...boardInputStyle, marginTop: 14 }}
              >
                {NOTICE_BOARD_DEFS.map((board) => (
                  <option key={board.key} value={board.key}>
                    {board.label}
                  </option>
                ))}
              </select>
            </section>

            <section style={{ border: "1px solid #d9e6ef", borderRadius: 18, background: "#fbfdfe", padding: 18 }}>
              <div style={boardSectionTitleStyle}>게시 상태</div>
              <label style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, fontWeight: 900, color: "#103b53" }}>
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
                상단 고정
              </label>
            </section>
          </div>

          <section style={{ border: "1px solid #d9e6ef", borderRadius: 18, background: "#ffffff", padding: 18 }}>
            <div style={boardSectionTitleStyle}>제목</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...boardInputStyle, marginTop: 14 }} />
          </section>

          <section style={{ border: "1px solid #d9e6ef", borderRadius: 18, background: "#ffffff", padding: 18 }}>
            <div style={boardSectionTitleStyle}>본문</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} style={{ ...boardTextareaStyle, marginTop: 14 }} />
          </section>

          {err ? <div style={{ color: "#b42318", fontWeight: 800 }}>{err}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={loading || !canManageAll}
              style={{
                ...boardPrimaryButtonStyle,
                opacity: loading || !canManageAll ? 0.55 : 1,
                cursor: loading || !canManageAll ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "저장 중..." : mode === "create" ? "등록" : "수정 저장"}
            </button>
          </div>
        </div>
      </form>

      <style jsx>{`
        @media (max-width: 900px) {
          .board-form-top-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
