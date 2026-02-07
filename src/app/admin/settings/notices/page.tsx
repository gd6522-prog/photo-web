"use client";

import React, { useEffect, useState } from "react";

type Notice = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  updated_at: string;
};

export default function NoticesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notice[]>([]);
  const [err, setErr] = useState("");

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const load = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notices/list", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "공지 불러오기 실패");
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

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setIsPinned(false);
  };

  const onEdit = (n: Notice) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setIsPinned(n.is_pinned);
  };

  const onSave = async () => {
    if (!title.trim()) return alert("제목을 입력하세요.");
    if (!body.trim()) return alert("내용을 입력하세요.");

    const payload = {
      id: editingId, // null이면 신규
      title: title.trim(),
      body: body.trim(),
      is_pinned: isPinned,
    };

    const res = await fetch("/api/admin/notices/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!json.ok) return alert(json.message || "저장 실패");

    resetForm();
    await load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("이 공지사항을 삭제할까요?")) return;

    const res = await fetch("/api/admin/notices/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ id }),
    });

    const json = await res.json();
    if (!json.ok) return alert(json.message || "삭제 실패");

    if (editingId === id) resetForm();
    await load();
  };

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ fontWeight: 950, fontSize: 20, color: "#111827" }}>공지사항 등록/작성</div>
      <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>메인에 표시될 공지사항을 등록/수정/삭제합니다.</div>

      <div style={{ height: 14 }} />

      {/* FORM */}
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 16, background: "white", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 950, color: "#111827" }}>{editingId ? "공지 수정" : "공지 등록"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={load}
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                background: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              새로고침
            </button>
            <button
              onClick={resetForm}
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                background: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              초기화
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151", marginBottom: 6 }}>제목</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목"
              style={{
                width: "100%",
                height: 40,
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                padding: "0 12px",
                fontWeight: 700,
                outline: "none",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#374151", marginBottom: 6 }}>내용</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="공지 내용"
              rows={6}
              style={{
                width: "100%",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                padding: 12,
                fontWeight: 700,
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", fontWeight: 950 }}>
            <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
            상단 고정(📌)
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onSave}
              style={{
                height: 42,
                padding: "0 14px",
                borderRadius: 12,
                border: "1px solid #111827",
                background: "#111827",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {editingId ? "수정 저장" : "등록"}
            </button>

            {editingId && (
              <button
                onClick={() => {
                  if (!confirm("수정 중인 내용을 취소할까요?")) return;
                  resetForm();
                }}
                style={{
                  height: 42,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                수정 취소
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* LIST */}
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 16, background: "white", padding: 14 }}>
        <div style={{ fontWeight: 950, color: "#111827" }}>등록된 공지</div>
        <div style={{ height: 10 }} />

        {loading ? (
          <div style={{ color: "#6B7280", fontSize: 13 }}>불러오는 중…</div>
        ) : err ? (
          <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>
        ) : items.length === 0 ? (
          <div style={{ color: "#6B7280", fontSize: 13 }}>등록된 공지사항이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((n) => (
              <div
                key={n.id}
                style={{
                  border: "1px solid #F3F4F6",
                  borderRadius: 14,
                  padding: 12,
                  background: n.is_pinned ? "#FFF7ED" : "#FAFAFB",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 950, color: "#111827" }}>
                    {n.is_pinned ? "📌 " : ""}
                    {n.title}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => onEdit(n)}
                      style={{
                        height: 30,
                        padding: "0 10px",
                        borderRadius: 10,
                        border: "1px solid #E5E7EB",
                        background: "white",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => onDelete(n.id)}
                      style={{
                        height: 30,
                        padding: "0 10px",
                        borderRadius: 10,
                        border: "1px solid #EF4444",
                        background: "#FEE2E2",
                        color: "#EF4444",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 6, color: "#374151", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {n.body}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                  수정일: {new Date(n.updated_at).toLocaleString("ko-KR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
