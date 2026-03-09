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
    label: "\uacf5\uc9c0\uc0ac\ud56d",
    shortLabel: "\uacf5\uc9c0",
    description: "\uc804\uc0ac \uacf5\uc9c0\uc640 \ud544\uc218 \uc548\ub0b4\ub97c \uacf5\uc720\ud569\ub2c8\ub2e4.",
    tone: { bg: "#E0F2FE", text: "#075985", border: "#7DD3FC" },
  },
  {
    key: "operation",
    label: "\uc6b4\uc601\uac8c\uc2dc\ud310",
    shortLabel: "\uc6b4\uc601",
    description: "\uc13c\ud130 \uc6b4\uc601, \uc778\ub825, \uc77c\uc815 \uad00\ub828 \uacf5\uc9c0\ub97c \uad00\ub9ac\ud569\ub2c8\ub2e4.",
    tone: { bg: "#DCFCE7", text: "#166534", border: "#86EFAC" },
  },
  {
    key: "transport",
    label: "\uc6b4\uc1a1\uac8c\uc2dc\ud310",
    shortLabel: "\uc6b4\uc1a1",
    description: "\ubc30\uc1a1, \ucc28\ub7c9, \ub3d9\uc120 \uad00\ub828 \ub0b4\uc6a9\uc744 \uacf5\uc720\ud569\ub2c8\ub2e4.",
    tone: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  },
  {
    key: "safety",
    label: "\uc548\uc804\uac8c\uc2dc\ud310",
    shortLabel: "\uc548\uc804",
    description: "\uc548\uc804 \uc218\uce59\uacfc \uc0ac\uace0 \uc608\ubc29 \uacf5\uc9c0\ub97c \uad00\ub9ac\ud569\ub2c8\ub2e4.",
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
