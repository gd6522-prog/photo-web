export type NoticeBoardKey = "notice" | "operation" | "transport" | "safety";

export type NoticeBoardDef = {
  key: NoticeBoardKey;
  label: string;
  shortLabel: string;
  description: string;
  tone: {
    bg: string;
    text: string;
    border: string;
  };
};

export type NoticePost = {
  id: string;
  title: string;
  body: string;
  board_key: NoticeBoardKey;
  excerpt?: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  author_name: string | null;
};

export const NOTICE_BOARD_DEFS: NoticeBoardDef[] = [
  {
    key: "notice",
    label: "공지사항",
    shortLabel: "공지",
    description: "전사 공지와 필수 안내를 공유합니다.",
    tone: { bg: "#E0F2FE", text: "#075985", border: "#7DD3FC" },
  },
  {
    key: "operation",
    label: "운영게시판",
    shortLabel: "운영",
    description: "센터 운영, 인력, 일정 관련 공지를 관리합니다.",
    tone: { bg: "#DCFCE7", text: "#166534", border: "#86EFAC" },
  },
  {
    key: "transport",
    label: "운송게시판",
    shortLabel: "운송",
    description: "배송, 차량, 노선 관련 내용을 공유합니다.",
    tone: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  },
  {
    key: "safety",
    label: "안전게시판",
    shortLabel: "안전",
    description: "안전 수칙과 사고 예방 공지를 관리합니다.",
    tone: { bg: "#FEE2E2", text: "#B91C1C", border: "#FCA5A5" },
  },
];

export const NOTICE_BOARD_ALL = "all" as const;
export type NoticeBoardFilter = NoticeBoardKey | typeof NOTICE_BOARD_ALL;

export function isNoticeBoardKey(value: unknown): value is NoticeBoardKey {
  return NOTICE_BOARD_DEFS.some((board) => board.key === value);
}

export function getNoticeBoardDef(boardKey: NoticeBoardKey): NoticeBoardDef {
  return NOTICE_BOARD_DEFS.find((board) => board.key === boardKey) ?? NOTICE_BOARD_DEFS[0];
}

const META_PREFIX = "<!--board:";
const META_SUFFIX = "-->";
const META_RE = /^<!--board:([a-z_]+)-->\r?\n?/;

export function parseNoticeBoardBody(rawBody: unknown): { boardKey: NoticeBoardKey; body: string } {
  const text = String(rawBody ?? "");
  const match = text.match(META_RE);
  if (!match) return { boardKey: "notice", body: text };

  const boardKey = isNoticeBoardKey(match[1]) ? match[1] : "notice";
  return { boardKey, body: text.replace(META_RE, "") };
}

export function buildNoticeBoardBody(boardKey: NoticeBoardKey, body: string) {
  const normalized = String(body ?? "").replace(META_RE, "");
  return `${META_PREFIX}${boardKey}${META_SUFFIX}\n${normalized}`.trim();
}

export function makeNoticeExcerpt(body: string, maxLength = 140) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}
