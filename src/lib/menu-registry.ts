export type MenuGroup = "nav" | "settings";

export type MenuItem = {
  key: string;
  label: string;
  href: string;
  group: MenuGroup;
  order: number;
  mainOnly?: boolean;
  match?: (pathname: string) => boolean;
};

export const MENU_REGISTRY: MenuItem[] = [
  { key: "admin_home", label: "메인", href: "/admin", group: "nav", order: 10 },
  { key: "admin_photos", label: "사진", href: "/admin/photos", group: "nav", order: 20 },
  { key: "admin_operation", label: "운영", href: "/admin/operation", group: "nav", order: 24 },
  { key: "admin_vehicle", label: "차량", href: "/admin/vehicles", group: "nav", order: 25 },
  {
    key: "admin_notice",
    label: "게시판",
    href: "/admin/notice",
    group: "nav",
    order: 30,
    match: (pathname) => pathname === "/admin/notice" || pathname.startsWith("/admin/notice/"),
  },
  { key: "admin_work_log", label: "근태", href: "/admin/work-log", group: "nav", order: 40 },
  { key: "settings_store_master", label: "점포마스터", href: "/admin/settings/store-master", group: "settings", order: 110 },
  { key: "settings_inspection_stores", label: "검수점포", href: "/admin/settings/inspection-stores", group: "settings", order: 120 },
  { key: "settings_user_master", label: "운영/현장 사용자마스터", href: "/admin/settings/user-master", group: "settings", order: 140 },
  { key: "settings_driver_master", label: "기사 사용자마스터", href: "/admin/settings/driver-master", group: "settings", order: 145 },
  { key: "settings_store_contacts", label: "점포 연락처", href: "/admin/settings/store-contacts", group: "settings", order: 148 },
  { key: "settings_permissions", label: "권한 설정", href: "/admin/settings/permissions", group: "settings", order: 150, mainOnly: true },
  { key: "settings_holidays", label: "공휴일 동기화", href: "/admin/settings/holidays", group: "settings", order: 160, mainOnly: true },
];

export function getNavItems() {
  return MENU_REGISTRY.filter((m) => m.group === "nav").sort((a, b) => a.order - b.order);
}

export function getSettingsItems() {
  return MENU_REGISTRY.filter((m) => m.group === "settings").sort((a, b) => a.order - b.order);
}

export function getAllItems() {
  return [...MENU_REGISTRY].sort((a, b) => a.order - b.order);
}

function stripTrailingSlash(path: string) {
  if (!path) return path;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function findMenuKeyByPath(pathname: string): string | null {
  const path = stripTrailingSlash(pathname);

  for (const item of getAllItems()) {
    if (item.match?.(path)) return item.key;
  }

  const sorted = [...getAllItems()]
    .filter((item) => !item.match)
    .sort((a, b) => stripTrailingSlash(b.href).length - stripTrailingSlash(a.href).length);

  for (const item of sorted) {
    const href = stripTrailingSlash(item.href);
    if (href === "/admin") {
      if (path === "/admin") return item.key;
      continue;
    }
    if (path === href || path.startsWith(href + "/")) return item.key;
  }

  if (path === "/admin/settings" || path.startsWith("/admin/settings/")) return "settings_store_master";
  if (path === "/admin/notice" || path.startsWith("/admin/notice/")) return "admin_notice";
  return null;
}
