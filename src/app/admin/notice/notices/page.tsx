"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

const ADMIN_EMAIL = "gd6522@naver.com";
const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";

function hardToLogin() {
  window.location.replace("/login");
}

function normWorkPart(v: unknown) {
  return String(v ?? "").trim();
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #DDE3EA",
  borderRadius: 16,
  background: "white",
  boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
};

export default function AdminNoticesPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const focusId = sp.get("focus");

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");

  const [loadingList, setLoadingList] = useState(true);
  const [list, setList] = useState<NoticeRow[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const mounted = useRef(false);

  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const sess = data.session;
    if (!sess) {
      hardToLogin();
      return { ok: false as const };
    }

    const u = sess.user;
    setUid(u.id);
    setEmail(u.email ?? "");

    const { data: prof } = await supabase.from("profiles").select("id, is_admin, work_part").eq("id", u.id).maybeSingle();

    const p = prof as { is_admin?: boolean | null; work_part?: string | null } | null;
    const hardAdmin = u.id === ADMIN_UID || (u.email ?? "") === ADMIN_EMAIL;
    const main = hardAdmin || !!p?.is_admin;
    const general = normWorkPart(p?.work_part) === "관리자";

    const admin = main || general;
    setIsAdmin(admin);
    return { ok: true as const, admin };
  };

  const loadList = async () => {
    setErr("");
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, body, is_pinned, created_at, updated_at, created_by")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setList((data ?? []) as NoticeRow[]);
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? "공지 목록 조회 실패");
      setList([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) hardToLogin();
    });
    return () => {
      try {
        sub.subscription.unsubscribe();
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    (async () => {
      setChecking(true);
      try {
        const r = await loadAdmin();
        if (!r.ok) return;
        await loadList();
      } catch {
        hardToLogin();
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const n = list.find((x) => x.id === focusId);
    if (!n) return;
    setEditingId(n.id);
    setTitle(n.title ?? "");
    setBody(n.body ?? "");
    setIsPinned(!!n.is_pinned);
  }, [focusId, list]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setIsPinned(false);
    router.replace("/admin/notice/notices");
  };

  const onSave = async () => {
    setErr("");
    if (!title.trim()) return setErr("제목을 입력해 주세요.");
    if (!body.trim()) return setErr("내용을 입력해 주세요.");

    setSaving(true);
    try {
      if (!editingId) {
        const { error } = await supabase.from("notices").insert({
          title: title.trim(),
          body: body.trim(),
          is_pinned: !!isPinned,
          created_by: uid,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notices")
          .update({
            title: title.trim(),
            body: body.trim(),
            is_pinned: !!isPinned,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (error) throw error;
      }

      await loadList();
      resetForm();
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const onEditPick = (n: NoticeRow) => {
    setEditingId(n.id);
    setTitle(n.title ?? "");
    setBody(n.body ?? "");
    setIsPinned(!!n.is_pinned);
    router.replace(`/admin/notice/notices?focus=${n.id}`);
  };

  const onDelete = async (id: string) => {
    if (!confirm("삭제할까요?")) return;
    setErr("");
    try {
      const { error } = await supabase.from("notices").delete().eq("id", id);
      if (error) throw error;
      await loadList();
      if (editingId === id) resetForm();
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? "삭제 실패");
    }
  };

  if (checking) return <div style={{ padding: 16, color: "#6B7280" }}>로딩...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>권한이 없습니다.</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자 계정으로 로그인해 주세요.</div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>
          현재 로그인: {email || "-"} / UID: {uid || "-"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 10px", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", background: "#F3F5F8", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 20, color: "#111827" }}>공지 관리</div>
            <div style={{ marginTop: 4, color: "#6B7280", fontSize: 13 }}>공지 등록/수정/삭제를 관리합니다.</div>
          </div>
          <Link
            href="/admin"
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #D1D5DB",
              background: "white",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              fontWeight: 900,
              color: "#111827",
            }}
          >
            메인으로
          </Link>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <section style={cardStyle}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #EEF2F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, color: "#111827" }}>{editingId ? "공지 수정" : "공지 등록"}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={loadList} style={{ height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid #D1D5DB", background: "white", cursor: "pointer", fontWeight: 900 }}>
                  새로고침
                </button>
                <button onClick={resetForm} style={{ height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid #D1D5DB", background: "white", cursor: "pointer", fontWeight: 900 }}>
                  초기화
                </button>
              </div>
            </div>

            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>제목</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", height: 42, marginTop: 6, borderRadius: 12, border: "1px solid #D1D5DB", padding: "0 12px", outline: "none" }} />

              <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700, marginTop: 12 }}>내용</div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ width: "100%", height: 220, marginTop: 6, borderRadius: 12, border: "1px solid #D1D5DB", padding: 12, outline: "none", resize: "vertical" }} />

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#111827", fontWeight: 800 }}>
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
                상단 고정(📌)
              </label>

              {err ? <div style={{ marginTop: 10, color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>{err}</div> : null}

              <button
                onClick={onSave}
                disabled={saving}
                style={{
                  marginTop: 12,
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid #111827",
                  background: saving ? "#111827" : "white",
                  color: saving ? "white" : "#111827",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </section>

          <section style={cardStyle}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #EEF2F6", fontWeight: 900, color: "#111827" }}>등록된 공지</div>

            <div style={{ padding: 10 }}>
              {loadingList ? (
                <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중...</div>
              ) : list.length === 0 ? (
                <div style={{ color: "#6B7280", fontSize: 13 }}>등록된 공지가 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.map((n) => (
                    <div key={n.id} style={{ border: "1px solid #EEF2F6", borderRadius: 14, padding: 10, background: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900, color: "#111827", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.is_pinned ? "📌 " : ""}
                          {n.title}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => onEditPick(n)} style={{ height: 28, padding: "0 10px", borderRadius: 10, border: "1px solid #D1D5DB", background: "white", cursor: "pointer", fontWeight: 900 }}>
                            수정
                          </button>
                          <button onClick={() => onDelete(n.id)} style={{ height: 28, padding: "0 10px", borderRadius: 10, border: "1px solid #FCA5A5", background: "white", cursor: "pointer", fontWeight: 900, color: "#B91C1C" }}>
                            삭제
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>{new Date(n.updated_at).toLocaleString("ko-KR")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
