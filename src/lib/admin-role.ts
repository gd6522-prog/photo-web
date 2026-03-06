export const ADMIN_EMAIL = "gd6522@naver.com";
export const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

export function isGeneralAdminWorkPart(workPart: unknown) {
  const raw = norm(workPart);
  const compact = raw.replace(/\s+/g, "");
  if (!compact) return false;
  if (compact === "비관리자") return false;
  return compact === "관리자" || compact.includes("관리자");
}

export function isMainAdminIdentity(uid: string, email: string) {
  return uid === ADMIN_UID || email === ADMIN_EMAIL;
}
