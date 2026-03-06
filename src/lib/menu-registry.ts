export type MenuGroup = "nav" | "settings";

export type MenuItem = {
  key: string;
  label: string;
  href: string;
  group: MenuGroup;
  order: number;
  // 메인관리자만 보이게 할 메뉴(예: 권한 설정)
  mainOnly?: boolean;
  // ✅ 활성화 매칭을 커스터마이즈(섹션 루트/별칭 경로 등)
  // - 예: 공지 섹션은 /admin/notice/* 전부를 admin_notice로 활성 처리
  match?: (pathname: string) => boolean;
};

/**
 * ✅ 경로 정책(최종, 최신화)
 * - 공지 섹션(드롭다운/하위메뉴)
 *   /admin/notice
 *   /admin/notice/calendar
 *   /admin/notice/notices
 *
 * - settings는 기존 유지
 *
 * ✅ 활성화(선택) 규칙
 * - 공지 섹션은 /admin/notice 및 하위경로 전부 admin_notice로 활성
 * - /admin/settings 및 하위경로는 settings_store_master로 활성(루트 취급)
 */
export const MENU_REGISTRY: MenuItem[] = [
  // ===== 상단 네비 =====
  { key: "admin_home", label: "메인", href: "/admin", group: "nav", order: 10 },
  { key: "admin_photos", label: "사진", href: "/admin/photos", group: "nav", order: 20 },

  // ✅ 공지(섹션 루트)
  // - 실제 페이지는 /admin/notice/* 로 구성
  // - 메뉴는 섹션 대표로 하나만 노출(드롭다운은 레이아웃에서 처리)
  {
    key: "admin_notice",
    label: "공지",
    href: "/admin/notice",
    group: "nav",
    order: 30,
    match: (p) => p === "/admin/notice" || p.startsWith("/admin/notice/"),
  },

  // ✅ 출퇴근 이력관리
  { key: "admin_work_log", label: "근태", href: "/admin/work-log", group: "nav", order: 40 },

  // ===== 설정(좌측 + 드롭다운) =====
  { key: "settings_store_master", label: "1. 점포마스터 최신화", href: "/admin/settings/store-master", group: "settings", order: 110 },
  { key: "settings_inspection_stores", label: "2. 검수점포 최신화", href: "/admin/settings/inspection-stores", group: "settings", order: 120 },

  // ✅ 사용자 마스터(운영/현장)
  { key: "settings_user_master", label: "4. 운영/현장 사용자마스터", href: "/admin/settings/user-master", group: "settings", order: 140 },

  // ✅ 기사 사용자 마스터(신규)
  { key: "settings_driver_master", label: "5. 기사 사용자마스터", href: "/admin/settings/driver-master", group: "settings", order: 145 },

  // 메인관리자만 접근/노출
  { key: "settings_permissions", label: "6. 권한 설정", href: "/admin/settings/permissions", group: "settings", order: 150, mainOnly: true },

  // ✅ 공휴일 자동 동기화(공공데이터포털)
  { key: "settings_holidays", label: "7. 공휴일 동기화", href: "/admin/settings/holidays", group: "settings", order: 160, mainOnly: true },
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

/**
 * 현재 경로가 어떤 메뉴에 속하는지 찾아서 menu_key 리턴 (최신화)
 * 우선순위:
 *  1) item.match 있으면 match 우선
 *  2) 그 외는 "긴 href 우선" prefix 매칭
 *  3) /admin/settings 및 하위는 settings_store_master 취급
 *  4) /admin/notice 및 하위는 admin_notice 취급 (안전망)
 */
export function findMenuKeyByPath(pathname: string): string | null {
  const path = stripTrailingSlash(pathname);

  // ✅ 1) match 우선
  for (const it of getAllItems()) {
    if (it.match?.(path)) return it.key;
  }

  // ✅ 2) 긴 href 우선 매칭
  const sorted = [...getAllItems()]
    .filter((it) => !it.match)
    .sort((a, b) => stripTrailingSlash(b.href).length - stripTrailingSlash(a.href).length);

  for (const it of sorted) {
    const href = stripTrailingSlash(it.href);

    // /admin은 정확히만
    if (href === "/admin") {
      if (path === "/admin") return it.key;
      continue;
    }

    if (path === href || path.startsWith(href + "/")) return it.key;
  }

  // ✅ 3) settings 루트/하위는 store-master 취급
  if (path === "/admin/settings" || path.startsWith("/admin/settings/")) return "settings_store_master";

  // ✅ 4) 공지 섹션 안전망
  if (path === "/admin/notice" || path.startsWith("/admin/notice/")) return "admin_notice";

  return null;
}