export type CalendarEventType = "general" | "new_store" | "nb_transition";

export const CALENDAR_EVENT_TYPE_ORDER: Record<CalendarEventType, number> = {
  general: 10,
  new_store: 20,
  nb_transition: 30,
};

const TYPE_MARKER_PREFIX = "[[EVENT_TYPE:";
const TYPE_MARKER_SUFFIX = "]]";

export const CALENDAR_EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  general: "\uC77C\uBC18\uC77C\uC815",
  new_store: "\uC2E0\uADDC\uC810\uC77C\uC815",
  nb_transition: "NB\uC804\uD658\uC810\uC77C\uC815",
};

export const CALENDAR_EVENT_TYPE_BADGE: Record<
  CalendarEventType,
  { bg: string; border: string; text: string }
> = {
  general: { bg: "#D6D9DF", border: "#3F4752", text: "#111827" },
  new_store: { bg: "#DEEAF7", border: "#7D9FC7", text: "#345C8A" },
  nb_transition: { bg: "#F6E7BE", border: "#C9A85F", text: "#8A6A2F" },
};

function normalizeType(value: string | null | undefined): CalendarEventType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "new_store") return "new_store";
  if (raw === "nb_transition") return "nb_transition";
  return "general";
}

export function stripCalendarEventType(rawMemo: string | null | undefined): string {
  const raw = String(rawMemo ?? "");
  if (!raw.startsWith(TYPE_MARKER_PREFIX)) return raw.trim();

  const markerEnd = raw.indexOf(TYPE_MARKER_SUFFIX);
  if (markerEnd < 0) return raw.trim();

  return raw.slice(markerEnd + TYPE_MARKER_SUFFIX.length).trim();
}

export function parseCalendarEventType(rawMemo: string | null | undefined): CalendarEventType {
  const raw = String(rawMemo ?? "");
  if (!raw.startsWith(TYPE_MARKER_PREFIX)) return "general";

  const markerEnd = raw.indexOf(TYPE_MARKER_SUFFIX);
  if (markerEnd < 0) return "general";

  return normalizeType(raw.slice(TYPE_MARKER_PREFIX.length, markerEnd));
}

export function encodeCalendarEventMemo(
  eventType: CalendarEventType,
  memo: string | null | undefined
): string | null {
  const cleanMemo = stripCalendarEventType(memo);
  if (eventType === "general") return cleanMemo || null;
  return `${TYPE_MARKER_PREFIX}${eventType}${TYPE_MARKER_SUFFIX}\n${cleanMemo}`.trim();
}

export function dominantCalendarEventType(
  eventTypes: CalendarEventType[]
): CalendarEventType {
  if (eventTypes.includes("new_store")) return "new_store";
  if (eventTypes.includes("nb_transition")) return "nb_transition";
  return "general";
}

export function summarizeCalendarEventTypes(
  eventTypes: CalendarEventType[]
): Record<CalendarEventType, number> {
  return eventTypes.reduce(
    (acc, type) => {
      acc[type] += 1;
      return acc;
    },
    {
      general: 0,
      new_store: 0,
      nb_transition: 0,
    } as Record<CalendarEventType, number>
  );
}

export function calendarEventBadgeBackground(
  counts: Record<CalendarEventType, number>
): string {
  const entries = (Object.entries(counts) as [CalendarEventType, number][]).filter(([, count]) => count > 0);

  if (entries.length === 0) return CALENDAR_EVENT_TYPE_BADGE.general.bg;
  if (entries.length === 1) return CALENDAR_EVENT_TYPE_BADGE[entries[0][0]].bg;

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let start = 0;
  const stops = entries.map(([type, count]) => {
    const end = start + (count / total) * 100;
    const color = CALENDAR_EVENT_TYPE_BADGE[type].bg;
    const stop = `${color} ${start}% ${end}%`;
    start = end;
    return stop;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

export function calendarEventBadgeBorderColor(
  counts: Record<CalendarEventType, number>
): string {
  const dominant = dominantCalendarEventType(
    (Object.entries(counts) as [CalendarEventType, number][]).flatMap(([type, count]) => Array(count).fill(type))
  );
  return CALENDAR_EVENT_TYPE_BADGE[dominant].border;
}

export function isMixedCalendarEventTypes(
  counts: Record<CalendarEventType, number>
): boolean {
  return Object.values(counts).filter((count) => count > 0).length > 1;
}

export function compareCalendarEventType(
  a: CalendarEventType,
  b: CalendarEventType
): number {
  return CALENDAR_EVENT_TYPE_ORDER[a] - CALENDAR_EVENT_TYPE_ORDER[b];
}