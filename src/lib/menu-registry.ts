export type MenuGroup = "nav" | "settings";

export type MenuItem = {
  key: string;
  label: string;
  href: string;
  group: MenuGroup;
  order: number;
  mainOnly?: boolean;
  parent?: string; // 상위 메뉴 key (하위 항목에만 설정)
  match?: (pathname: string) => boolean;
};

export const MENU_REGISTRY: MenuItem[] = [
  // ── 상단 Nav (최상위)
  { key: "admin_home",      label: "메인",   href: "/admin",            group: "nav", order: 10 },
  { key: "admin_photos",    label: "사진",   href: "/admin/photos",     group: "nav", order: 20 },
  { key: "admin_operation", label: "운영",   href: "/admin/operation",  group: "nav", order: 24 },
  { key: "admin_vehicle",   label: "차량",   href: "/admin/vehicles",   group: "nav", order: 25 },
  {
    key: "admin_notice",
    label: "게시판",
    href: "/admin/notice",
    group: "nav",
    order: 30,
    match: (p) => p === "/admin/notice" || p.startsWith("/admin/notice/"),
  },
  { key: "admin_work_log",  label: "근태",   href: "/admin/work-log",   group: "nav", order: 40 },

  // ── 사진 하위
  { key: "admin_photos_field",    label: "현장사진", href: "/admin/photos",                     group: "nav", order: 21, parent: "admin_photos" },
  { key: "admin_photos_delivery", label: "배송사진", href: "/admin/photos/delivery",            group: "nav", order: 22, parent: "admin_photos" },
  { key: "admin_photos_hazard",   label: "위험요인", href: "/admin/hazards",                    group: "nav", order: 23, parent: "admin_photos" },

  // ── 운영 하위
  { key: "admin_operation_unit",  label: "단품별",   href: "/admin/operation",                  group: "nav", order: 241, parent: "admin_operation" },
  { key: "admin_operation_cdc",   label: "CDC",      href: "/admin/vehicles/cdc",               group: "nav", order: 242, parent: "admin_operation" },

  // ── 차량 하위
  { key: "admin_vehicle_cargo",    label: "물동량",   href: "/admin/vehicles",                  group: "nav", order: 251, parent: "admin_vehicle" },
  { key: "admin_vehicle_report",   label: "운행일보", href: "/admin/vehicles/report",           group: "nav", order: 252, parent: "admin_vehicle" },
  { key: "admin_vehicle_support",  label: "지원",     href: "/admin/vehicles/support",          group: "nav", order: 253, parent: "admin_vehicle" },
  { key: "admin_vehicle_adhesion", label: "점착",     href: "/admin/vehicles/adhesion",         group: "nav", order: 254, parent: "admin_vehicle" },

  // ── 게시판 하위
  { key: "admin_notice_board",    label: "게시판",   href: "/admin/notice/boards?board=notice", group: "nav", order: 301, parent: "admin_notice" },
  { key: "admin_notice_calendar", label: "일정달력", href: "/admin/notice/calendar",            group: "nav", order: 302, parent: "admin_notice" },

  // ── 근태 하위
  { key: "admin_worklog_basic",  label: "기본근태", href: "/admin/work-log?tab=basic",          group: "nav", order: 401, parent: "admin_work_log" },
  { key: "admin_worklog_detail", label: "상세근태", href: "/admin/work-log?tab=detail",         group: "nav", order: 402, parent: "admin_work_log" },

  // ── 설정
  { key: "settings_store_master",       label: "점포마스터",             href: "/admin/settings/store-master",       group: "settings", order: 110 },
  { key: "settings_inspection_stores",  label: "검수점포",               href: "/admin/settings/inspection-stores",  group: "settings", order: 120 },
  { key: "settings_user_master",        label: "운영/현장 사용자마스터", href: "/admin/settings/user-master",        group: "settings", order: 140 },
  { key: "settings_driver_master",      label: "기사 사용자마스터",      href: "/admin/settings/driver-master",      group: "settings", order: 145 },
  { key: "settings_store_contacts",     label: "점포 연락처",            href: "/admin/settings/store-contacts",     group: "settings", order: 148 },
  { key: "settings_permissions",        label: "권한 설정",              href: "/admin/settings/permissions",        group: "settings", order: 150, mainOnly: true },
  { key: "settings_holidays",           label: "공휴일 동기화",          href: "/admin/settings/holidays",           group: "settings", order: 160, mainOnly: true },
];

/** 상단 Nav의 최상위 항목만 (parent 없는 것) */
export function getNavItems() {
  return MENU_REGISTRY.filter((m) => m.group === "nav" && !m.parent).sort((a, b) => a.order - b.order);
}

/** 특정 부모의 하위 항목 */
export function getSubItems(parentKey: string) {
  return MENU_REGISTRY.filter((m) => m.parent === parentKey).sort((a, b) => a.order - b.order);
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
    .sort((a, b) => {
      const aHref = stripTrailingSlash(a.href.split("?")[0]);
      const bHref = stripTrailingSlash(b.href.split("?")[0]);
      return bHref.length - aHref.length;
    });

  for (const item of sorted) {
    const href = stripTrailingSlash(item.href.split("?")[0]);
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
