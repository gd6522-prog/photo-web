"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { uploadFileToR2 } from "@/lib/r2-upload-client";
import { isNoticeBoardKey, NOTICE_BOARD_DEFS, noticeBodyToHtml, type NoticeBoardKey, type NoticePost } from "@/lib/notice-board";
import {
  boardCardStyle,
  boardGhostButtonStyle,
  boardInputStyle,
  boardPageShellStyle,
  boardPrimaryButtonStyle,
  boardSectionTitleStyle,
} from "./_board-theme";

type BoardFormProps = {
  mode: "create" | "edit";
  initialBoard: NoticeBoardKey;
  initialItem?: NoticePost | null;
};

const DEFAULT_IMAGE_WIDTH = 240;
const MIN_IMAGE_WIDTH = 120;
const HANDLE_SIZE = 14;
const ROTATION_STEP = 90;
const RESIZE_DIRECTIONS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

type ResizeDirection = (typeof RESIZE_DIRECTIONS)[number];

const toolbarButtonStyle = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  border: "1px solid #cfd8df",
  background: "linear-gradient(180deg, #ffffff 0%, #f4f7fa 100%)",
  color: "#21485f",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1,
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
} as const;

const toolbarDisabledButtonStyle = {
  ...toolbarButtonStyle,
  color: "#9aa9b5",
  cursor: "not-allowed",
  background: "linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%)",
} as const;

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function extFromMimeType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

function getImageRotation(wrapper: HTMLSpanElement) {
  const raw = Number.parseFloat(wrapper.dataset.rotation ?? "0");
  if (!Number.isFinite(raw)) return 0;
  return ((raw % 360) + 360) % 360;
}

function getBaseWidth(wrapper: HTMLSpanElement) {
  const raw = Number.parseFloat(wrapper.dataset.baseWidth ?? wrapper.style.width ?? `${DEFAULT_IMAGE_WIDTH}`);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_IMAGE_WIDTH;
  return Math.max(MIN_IMAGE_WIDTH, raw);
}

function getAspect(wrapper: HTMLSpanElement, image: HTMLImageElement) {
  const saved = Number.parseFloat(wrapper.dataset.aspect ?? "");
  if (Number.isFinite(saved) && saved > 0) return saved;
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    const aspect = image.naturalWidth / image.naturalHeight;
    wrapper.dataset.aspect = String(aspect);
    return aspect;
  }
  return 1;
}

function applyHandlePosition(handle: HTMLSpanElement, direction: ResizeDirection) {
  handle.style.position = "absolute";
  handle.style.width = `${HANDLE_SIZE}px`;
  handle.style.height = `${HANDLE_SIZE}px`;
  handle.style.borderRadius = "999px";
  handle.style.background = "#0e7490";
  handle.style.border = "2px solid #ffffff";
  handle.style.boxShadow = "0 2px 8px rgba(2,32,46,0.2)";
  handle.style.zIndex = "2";
  handle.style.top = "";
  handle.style.bottom = "";
  handle.style.left = "";
  handle.style.right = "";

  if (direction.includes("n")) handle.style.top = "-7px";
  else if (direction.includes("s")) handle.style.bottom = "-7px";
  else handle.style.top = "calc(50% - 7px)";

  if (direction.includes("w")) handle.style.left = "-7px";
  else if (direction.includes("e")) handle.style.right = "-7px";
  else handle.style.left = "calc(50% - 7px)";

  const cursorMap: Record<ResizeDirection, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
    sw: "nesw-resize",
  };
  handle.style.cursor = cursorMap[direction];
}

function ensureResizeHandles(wrapper: HTMLSpanElement) {
  RESIZE_DIRECTIONS.forEach((direction) => {
    let handle = wrapper.querySelector<HTMLSpanElement>(`[data-notice-resize-handle='1'][data-direction='${direction}']`);
    if (!(handle instanceof HTMLSpanElement)) {
      handle = document.createElement("span");
      handle.dataset.noticeResizeHandle = "1";
      handle.dataset.direction = direction;
      wrapper.appendChild(handle);
    }
    applyHandlePosition(handle, direction);
  });
}

function removeEditorOnlyNodes(root: HTMLElement) {
  root.querySelectorAll("[data-notice-resize-handle='1']").forEach((node) => node.remove());
  root.querySelectorAll("[contenteditable='false']").forEach((node) => node.removeAttribute("contenteditable"));
  root.querySelectorAll("[data-notice-image-wrapper='1']").forEach((node) => {
    if (!(node instanceof HTMLSpanElement)) return;
    node.style.display = "inline-block";
    node.style.position = "relative";
    node.style.verticalAlign = "top";
    node.style.maxWidth = "100%";
    node.style.margin = "8px 0";
    node.style.lineHeight = "0";
    node.style.cursor = "";
    node.style.outline = "";
    node.style.outlineOffset = "";
    node.style.overflow = "visible";

    const image = node.querySelector("img[data-notice-image='1']");
    if (image instanceof HTMLImageElement) {
      image.style.borderRadius = "12px";
      image.style.border = "1px solid #d9e6ef";
      image.style.background = "#fff";
      image.style.transformOrigin = "center center";
    }
  });
}

function normalizeEditorHtml(html: string) {
  const container = document.createElement("div");
  container.innerHTML = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();
  removeEditorOnlyNodes(container);
  return container.innerHTML.trim();
}

function getImageWrapper(target: EventTarget | null) {
  if (!(target instanceof Node)) return null;
  const element = target instanceof HTMLElement ? target : target.parentElement;
  if (!element) return null;
  const wrapper = element.closest("[data-notice-image-wrapper='1']");
  return wrapper instanceof HTMLSpanElement ? wrapper : null;
}

function bindImageLoad(wrapper: HTMLSpanElement, image: HTMLImageElement, onReady: () => void) {
  if (image.dataset.noticeAspectBound === "1") return;
  image.dataset.noticeAspectBound = "1";
  image.addEventListener("load", () => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      wrapper.dataset.aspect = String(image.naturalWidth / image.naturalHeight);
      onReady();
    }
  });
}

function applyWrapperStyles(wrapper: HTMLSpanElement, selected: boolean, onReady: () => void) {
  wrapper.style.display = "inline-block";
  wrapper.style.position = "relative";
  wrapper.style.verticalAlign = "top";
  wrapper.style.maxWidth = "100%";
  wrapper.style.margin = "8px 0";
  wrapper.style.lineHeight = "0";
  wrapper.style.cursor = "default";
  wrapper.style.outline = selected ? "2px solid #0e7490" : "none";
  wrapper.style.outlineOffset = "2px";
  wrapper.style.overflow = "visible";

  const image = wrapper.querySelector("img[data-notice-image='1']");
  if (image instanceof HTMLImageElement) {
    bindImageLoad(wrapper, image, onReady);

    const rotation = getImageRotation(wrapper);
    const baseWidth = getBaseWidth(wrapper);
    const aspect = getAspect(wrapper, image);
    const baseHeight = baseWidth / aspect;
    const isQuarterTurn = rotation % 180 !== 0;
    const frameWidth = isQuarterTurn ? baseHeight : baseWidth;
    const frameHeight = isQuarterTurn ? baseWidth : baseHeight;

    wrapper.dataset.baseWidth = String(baseWidth);
    wrapper.style.width = `${frameWidth}px`;
    wrapper.style.height = `${frameHeight}px`;

    image.style.position = "absolute";
    image.style.left = "50%";
    image.style.top = "50%";
    image.style.display = "block";
    image.style.width = `${baseWidth}px`;
    image.style.height = `${baseHeight}px`;
    image.style.maxWidth = "none";
    image.style.borderRadius = "12px";
    image.style.border = "1px solid #d9e6ef";
    image.style.background = "#fff";
    image.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    image.style.transformOrigin = "center center";
    image.draggable = false;
  }

  ensureResizeHandles(wrapper);
  wrapper.querySelectorAll<HTMLSpanElement>("[data-notice-resize-handle='1']").forEach((handle) => {
    handle.style.display = selected ? "block" : "none";
  });
}

function insertNodeAtSelection(node: Node, editor: HTMLDivElement) {
  editor.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  const nextSelection = window.getSelection();
  if (!nextSelection || nextSelection.rangeCount === 0) return;

  const range = nextSelection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  nextSelection.removeAllRanges();
  nextSelection.addRange(range);
}

export function BoardForm({ mode, initialBoard, initialItem }: BoardFormProps) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const selectedImageIdRef = useRef("");
  const resizingRef = useRef<{
    wrapper: HTMLSpanElement;
    startX: number;
    startY: number;
    startBaseWidth: number;
    direction: ResizeDirection;
  } | null>(null);

  const [boardKey, setBoardKey] = useState<NoticeBoardKey>(initialItem?.board_key ?? initialBoard);
  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(() => noticeBodyToHtml(initialItem?.body ?? ""));
  const [isPinned, setIsPinned] = useState(!!initialItem?.is_pinned);
  const [canManageAll, setCanManageAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [err, setErr] = useState("");
  const [selectedImageId, setSelectedImageId] = useState("");
  selectedImageIdRef.current = selectedImageId;

  const refreshWrapper = (wrapper: HTMLSpanElement) => {
    applyWrapperStyles(wrapper, wrapper.dataset.imageId === selectedImageIdRef.current, () => {
      applyWrapperStyles(wrapper, wrapper.dataset.imageId === selectedImageIdRef.current, () => undefined);
      setBodyHtml(normalizeEditorHtml(editorRef.current?.innerHTML ?? ""));
    });
  };

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

    void loadRole();
  }, [boardKey]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = noticeBodyToHtml(initialItem?.body ?? "");
    editor.innerHTML = html || "<p><br></p>";
    setBodyHtml(normalizeEditorHtml(editor.innerHTML));
  }, [initialItem?.body]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    Array.from(editor.querySelectorAll("[data-notice-image-wrapper='1']")).forEach((node) => {
      if (!(node instanceof HTMLSpanElement)) return;
      if (!node.dataset.imageId) node.dataset.imageId = randomId();
      refreshWrapper(node);
    });
  }, [bodyHtml, selectedImageId]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const active = resizingRef.current;
      const editor = editorRef.current;
      if (!active || !editor) return;

      event.preventDefault();
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      let delta = 0;

      if (active.direction === "e" || active.direction === "se" || active.direction === "ne") delta = dx;
      if (active.direction === "w" || active.direction === "sw" || active.direction === "nw") delta = -dx;
      if (active.direction === "n") delta = -dy;
      if (active.direction === "s") delta = dy;
      if (active.direction === "ne" || active.direction === "nw") delta += -dy;
      if (active.direction === "se" || active.direction === "sw") delta += dy;
      if (active.direction.length === 2) delta /= 2;

      const maxBaseWidth = editor.clientWidth - 36;
      active.wrapper.dataset.baseWidth = String(Math.min(Math.max(MIN_IMAGE_WIDTH, active.startBaseWidth + delta), maxBaseWidth));
      refreshWrapper(active.wrapper);
    };

    const onMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      setBodyHtml(normalizeEditorHtml(editorRef.current?.innerHTML ?? ""));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const syncBodyFromEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setBodyHtml(normalizeEditorHtml(editor.innerHTML));
  };

  const uploadImage = async (file: File) => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) throw new Error("로그인 정보가 없습니다.");

    const ext = extFromMimeType(file.type);
    const path = `notices/${boardKey}/${session.user.id}/${Date.now()}_${randomId()}.${ext}`;
    const { publicUrl } = await uploadFileToR2({ file, bucket: "hazard-reports", path, accessToken: session.access_token });
    return publicUrl;
  };

  const createImageWrapper = (imageUrl: string) => {
    const wrapper = document.createElement("span");
    wrapper.dataset.noticeImageWrapper = "1";
    wrapper.dataset.imageId = randomId();
    wrapper.dataset.rotation = "0";
    wrapper.dataset.baseWidth = String(DEFAULT_IMAGE_WIDTH);
    wrapper.contentEditable = "false";

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "image";
    image.dataset.noticeImage = "1";
    image.draggable = false;
    wrapper.appendChild(image);

    refreshWrapper(wrapper);
    return wrapper;
  };

  const insertImageAtCaret = (imageUrl: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const wrapper = createImageWrapper(imageUrl);
    insertNodeAtSelection(wrapper, editor);
    insertNodeAtSelection(document.createTextNode("\u00a0"), editor);
    setSelectedImageId(wrapper.dataset.imageId ?? "");
    syncBodyFromEditor();
  };

  const onPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();
    setErr("");
    setUploadingImage(true);
    try {
      const imageUrl = await uploadImage(file);
      insertImageAtCaret(imageUrl);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploadingImage(false);
    }
  };

  const onEditorMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    const wrapper = getImageWrapper(target);

    if (target instanceof HTMLElement && target.dataset.noticeResizeHandle === "1" && wrapper) {
      event.preventDefault();
      event.stopPropagation();
      const direction = target.dataset.direction;
      if (!direction || !RESIZE_DIRECTIONS.includes(direction as ResizeDirection)) return;
      setSelectedImageId(wrapper.dataset.imageId ?? "");
      resizingRef.current = {
        wrapper,
        startX: event.clientX,
        startY: event.clientY,
        startBaseWidth: getBaseWidth(wrapper),
        direction: direction as ResizeDirection,
      };
      return;
    }

    if (wrapper) {
      setSelectedImageId(wrapper.dataset.imageId ?? "");
      return;
    }

    setSelectedImageId("");
  };

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedImageId) return;
    if (event.key !== "Backspace" && event.key !== "Delete") return;

    const editor = editorRef.current;
    if (!editor) return;
    const wrapper = editor.querySelector(`[data-notice-image-wrapper='1'][data-image-id='${selectedImageId}']`);
    if (!(wrapper instanceof HTMLSpanElement)) return;

    event.preventDefault();
    wrapper.remove();
    setSelectedImageId("");
    syncBodyFromEditor();
  };

  const rotateSelectedImage = (delta: number) => {
    const editor = editorRef.current;
    if (!editor || !selectedImageId) return;
    const wrapper = editor.querySelector(`[data-notice-image-wrapper='1'][data-image-id='${selectedImageId}']`);
    if (!(wrapper instanceof HTMLSpanElement)) return;

    wrapper.dataset.rotation = String(getImageRotation(wrapper) + delta);
    refreshWrapper(wrapper);
    syncBodyFromEditor();
  };

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

    const body = normalizeEditorHtml(editorRef.current?.innerHTML ?? bodyHtml);
    const hasText = body.replace(/<img[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, "").trim();
    if (!hasText && !body.includes("data-notice-image")) {
      setErr("내용을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) throw new Error("로그인 정보가 없습니다.");

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
          body,
          is_pinned: isPinned,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "저장에 실패했습니다.");
      router.push(`/admin/notice/boards?board=${boardKey}`);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
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
            <section style={{ border: "1px solid #d9e6ef", borderRadius: 0, background: "#fbfdfe", padding: 18 }}>
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

            <section style={{ border: "1px solid #d9e6ef", borderRadius: 0, background: "#fbfdfe", padding: 18 }}>
              <div style={boardSectionTitleStyle}>게시 상태</div>
              <label style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, fontWeight: 900, color: "#103b53" }}>
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
                상단 고정
              </label>
            </section>
          </div>

          <section style={{ border: "1px solid #d9e6ef", borderRadius: 0, background: "#ffffff", padding: 18 }}>
            <div style={boardSectionTitleStyle}>제목</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...boardInputStyle, marginTop: 14 }} />
          </section>

          <section style={{ border: "1px solid #d9e6ef", borderRadius: 0, background: "#ffffff", padding: 18 }}>
            <div style={boardSectionTitleStyle}>본문</div>
            <div
              style={{
                marginTop: 14,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 6px",
                border: "1px solid #d7e0e7",
                background: "#f8fafc",
                borderRadius: 4,
              }}
            >
              <button
                type="button"
                onClick={() => rotateSelectedImage(-ROTATION_STEP)}
                style={selectedImageId ? toolbarButtonStyle : toolbarDisabledButtonStyle}
                title="반시계 90도"
                disabled={!selectedImageId}
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => rotateSelectedImage(ROTATION_STEP)}
                style={selectedImageId ? toolbarButtonStyle : toolbarDisabledButtonStyle}
                title="시계 90도"
                disabled={!selectedImageId}
              >
                ↻
              </button>
            </div>

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncBodyFromEditor}
              onPaste={(event) => void onPaste(event)}
              onMouseDown={onEditorMouseDown}
              onKeyDown={onEditorKeyDown}
              style={{
                marginTop: 14,
                minHeight: 420,
                borderRadius: 0,
                border: "1px solid #c4d5e3",
                padding: 18,
                background: "#fff",
                color: "#103b53",
                lineHeight: 1.8,
                fontWeight: 600,
                outline: "none",
                boxSizing: "border-box",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            />
            {uploadingImage ? <div style={{ marginTop: 10, fontSize: 12, color: "#1d4ed8", fontWeight: 800 }}>이미지 업로드 중...</div> : null}
          </section>

          {err ? <div style={{ color: "#b42318", fontWeight: 800 }}>{err}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={loading || uploadingImage || !canManageAll}
              style={{
                ...boardPrimaryButtonStyle,
                opacity: loading || uploadingImage || !canManageAll ? 0.55 : 1,
                cursor: loading || uploadingImage || !canManageAll ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "저장 중..." : mode === "create" ? "등록" : "수정 저장"}
            </button>
          </div>
        </div>
      </form>

      <style jsx>{`
        div[contenteditable="true"] :global(p) {
          margin: 0 0 12px;
        }
        div[contenteditable="true"] :global([data-notice-image-wrapper="1"]) {
          user-select: none;
        }
        @media (max-width: 900px) {
          .board-form-top-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
