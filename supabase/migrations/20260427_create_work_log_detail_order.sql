-- 상세근태 화면 행 정렬 순서 (관리자 전체 공용 단일 정렬)
create table if not exists public.work_log_detail_order (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sort_key integer not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_log_detail_order_sort_key
  on public.work_log_detail_order (sort_key);

alter table public.work_log_detail_order enable row level security;

-- 클라이언트는 service-role 경유로만 접근하므로 명시적인 정책 없음.
-- 필요 시 서버 측 라우트에서 권한 체크 후 service role로 SELECT/UPSERT 수행.
