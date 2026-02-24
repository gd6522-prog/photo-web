export type MenuGroup = "nav" | "settings";

export type MenuItem = {
  key: string;
  label: string;
  href: string;
  group: MenuGroup;
  order: number;
  // 메인관리자만 보이게 할 메뉴(예: 권한 설정)
  mainOnly?: boolean;
};

export const MENU_REGISTRY: MenuItem[] = [
  // ===== 상단 네비 =====
  { key: "admin_home", label: "메인", href: "/admin", group: "nav", order: 10 },
  { key: "admin_photos", label: "사진", href: "/admin/photos", group: "nav", order: 20 },
  { key: "admin_calendar", label: "달력", href: "/admin/calendar", group: "nav", order: 30 },

  // ✅ 출퇴근 이력관리
  { key: "admin_work_log", label: "근태", href: "/admin/work-log", group: "nav", order: 40 },

  // ===== 설정(좌측 + 드롭다운) =====
  { key: "settings_store_master", label: "1. 점포마스터 최신화", href: "/admin/settings/store-master", group: "settings", order: 110 },
  { key: "settings_inspection_stores", label: "2. 검수점포 최신화", href: "/admin/settings/inspection-stores", group: "settings", order: 120 },
  { key: "settings_notices", label: "3. 공지사항 등록/작성", href: "/admin/settings/notices", group: "settings", order: 130 },

  // ✅ 사용자 마스터(관리자에서 사용자 정보 관리)
  { key: "settings_user_master", label: "4. 사용자마스터", href: "/admin/settings/user-master", group: "settings", order: 140 },

  // 메인관리자만 접근/노출
  { key: "settings_permissions", label: "5. 권한 설정", href: "/admin/settings/permissions", group: "settings", order: 150, mainOnly: true },

  // ✅ 공휴일 자동 동기화(공공데이터포털)
  { key: "settings_holidays", label: "6. 공휴일 동기화", href: "/admin/settings/holidays", group: "settings", order: 160, mainOnly: true },
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

// 현재 경로가 어떤 메뉴에 속하는지 찾아서 menu_key 리턴
export function findMenuKeyByPath(pathname: string): string | null {
  const items = getAllItems();

  // 더 긴 href가 우선 매칭되도록 길이 내림차순
  const sorted = [...items].sort((a, b) => b.href.length - a.href.length);

  for (const it of sorted) {
    if (it.href === "/admin") {
      if (pathname === "/admin" || pathname === "/admin/") return it.key;
      continue;
    }
    if (pathname === it.href || pathname.startsWith(it.href + "/")) return it.key;
  }

  // /admin/settings 루트는 store-master 취급
  if (pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")) return "settings_store_master";

  return null;
}