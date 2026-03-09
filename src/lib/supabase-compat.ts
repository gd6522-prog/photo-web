export function isMissingColumnError(error: unknown, column: string) {
  const code = String((error as { code?: string } | null)?.code ?? "").trim();
  const message = String((error as { message?: string } | null)?.message ?? "");
  const m = message.toLowerCase();
  const col = column.toLowerCase();
  if (!m.includes(col)) return false;
  return code === "PGRST204" || code === "42703";
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  const obj = (error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } | null) ?? null;
  const parts = [
    String(obj?.message ?? "").trim(),
    String(obj?.code ?? "").trim(),
    String(obj?.details ?? "").trim(),
    String(obj?.hint ?? "").trim(),
  ].filter(Boolean);
  if (parts.length) return parts.join(" | ");
  const plain = String(error ?? "").trim();
  if (plain && plain !== "[object Object]") return plain;
  try {
    const raw = JSON.stringify(error);
    if (raw && raw !== "{}") return raw;
  } catch {
    // ignore JSON serialization failures
  }
  return fallback;
}
