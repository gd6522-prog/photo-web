export function isMissingColumnError(error: unknown, column: string) {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return code === "PGRST204" && message.includes(column);
}
