export const ADMIN_EMAIL = "gd6522@naver.com";
export const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function compact(v: unknown) {
  return norm(v).replace(/\s+/g, "");
}

export function isCompanyAdminWorkPart(workPart: unknown) {
  return compact(workPart) === "업체관리자";
}

export function isGeneralAdminWorkPart(workPart: unknown) {
  const c = compact(workPart);
  if (!c || c === "비관리자") return false;
  if (c === "관리자" || c === "일반관리자" || c === "업체관리자") return true;
  return c.includes("관리자");
}

export function isMainAdminIdentity(uid: string, email: string) {
  return uid === ADMIN_UID || email === ADMIN_EMAIL;
}
