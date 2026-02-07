"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Notice = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

function Btn({
  children,
  onClick,
  variant = "solid",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "solid" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const base: React.CSSProperties = {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    fontWeight: 950,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid #E5E7EB",
    background: "white",
    color: "#111827",
  };
  if (variant === "solid") {
    base.border = "1px solid #111827";
    base.background = "#111827";
    base.color = "white";
  }
  if (variant === "danger") {
    base.border = "1px solid #DC2626";
    base.background = "#DC2626";
    base.color = "white";
  }
  if (variant === "ghost") {
    base.background = "white";
    base.border = "1px solid #E5E7EB";
    base.color = "#111827";
  }
  return (
    <button onClick={onClick} style={base} disabled={disabled}>
      {children}
    </button>
  );
}

export default function NoticesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notice[]>([]);
  const [err, setErr] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notices/list", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "불러오기 실패");
      setItems((json.items ?? []) as Notice[]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setPinned(false);
  };

  const startEdit = (n: Notice) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setPinned(!!n.is_pinned);
  };

  const save = async () => {
    setErr("");
    if (!title.trim()) return alert("제목을 입력해줘.");
    if (!body.trim()) return alert("내용을 입력해줘.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notices/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title, body, is_pinned: pinned }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "저장 실패");
      await load();
      alert("저장 완료!");
      startNew();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("삭제할까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "삭제 실패");
      await load();
      alert("삭제 완료!");
      if (editingId === id) startNew();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return arr;
  }, [items]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 12px", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 20 }}>공지사항 관리</div>
          <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>
            메인 화면 중앙에 표시될 공지를 등록/수정합니다. (📌 고정은 위로 올라감)
          </div>
        </div>
        <Link
          href="/admin"
          style={{
            height: 40,
            padding: "0 14px",
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            background: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontWeight: 950,
            color: "#111827",
          }}
        >
          메인으로
        </Link>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "420px 1fr", gap: 14, alignItems: "start" }}>
        {/* LEFT: 리스트 */}
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 16, background: "white", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 950 }}>공지 목록</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={load} disabled={busy}>
                새로고침
              </Btn>
              <Btn variant="solid" onClick={startNew} disabled={busy}>
                새 공지
              </Btn>
            </div>
          </div>

          <div style={{ padding: 12 }}>
            {loading ? (
              <div style={{ color: "#6B7280" }}>불러오는 중…</div>
            ) : err ? (
              <div style={{ color: "#B91C1C" }}>{err}</div>
            ) : sorted.length === 0 ? (
              <div style={{ color: "#6B7280" }}>공지 없음</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sorted.map((n) => {
                  const active = editingId === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => startEdit(n)}
                      style={{
                        textAlign: "left",
                        border: active ? "1px solid #111827" : "1px solid #E5E7EB",
                        background: active ? "#111827" : "white",
                        color: active ? "white" : "#111827",
                        padding: 12,
                        borderRadius: 14,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 950, fontSize: 14 }}>
                        {n.is_pinned ? "📌 " : ""}
                        {n.title}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                        {new Date(n.updated_at).toLocaleString("ko-KR")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: 편집 폼 */}
        <div style={{ border: "1px solid #E5E7EB", borderRadius: 16, background: "white", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 950 }}>{editingId ? "공지 수정" : "공지 등록"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {editingId ? (
                <Btn variant="danger" onClick={() => del(editingId)} disabled={busy}>
                  삭제
                </Btn>
              ) : null}
              <Btn variant="solid" onClick={save} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </Btn>
            </div>
          </div>

          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목"
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid #E5E7EB",
                  padding: "0 12px",
                  fontSize: 14,
                  fontWeight: 900,
                }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, cursor: "pointer" }}>
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                📌 고정
              </label>
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용"
              rows={12}
              style={{
                marginTop: 10,
                width: "100%",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                padding: 12,
                fontSize: 14,
                lineHeight: 1.6,
                resize: "vertical",
              }}
            />

            <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
              저장하면 메인 화면 공지사항 카드에 즉시 반영됩니다.
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1100px) {
          div[style*="grid-template-columns: 420px 1fr"] {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
