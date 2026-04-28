-- 외부인 차량 입차신청 테이블
create table if not exists public.parking_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('regular', 'visitor')),
  company text not null,
  name text not null,
  car_number text not null,
  phone text not null,
  visit_date date,
  expire_date date,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  reject_reason text,
  admin_memo text,
  ip text,
  created_at timestamptz default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

create index if not exists idx_parking_status     on public.parking_requests(status);
create index if not exists idx_parking_created    on public.parking_requests(created_at desc);
create index if not exists idx_parking_expire     on public.parking_requests(expire_date);
create index if not exists idx_parking_ip_created on public.parking_requests(ip, created_at desc);

alter table public.parking_requests enable row level security;

-- INSERT는 service_role(API route)만 허용 → anon/authenticated는 정책 없음 = 거부
-- 관리자(authenticated): 조회/수정/삭제 가능
drop policy if exists "parking authenticated select" on public.parking_requests;
drop policy if exists "parking authenticated update" on public.parking_requests;
drop policy if exists "parking authenticated delete" on public.parking_requests;

create policy "parking authenticated select"
  on public.parking_requests
  for select
  to authenticated
  using (true);

create policy "parking authenticated update"
  on public.parking_requests
  for update
  to authenticated
  using (true)
  with check (true);

create policy "parking authenticated delete"
  on public.parking_requests
  for delete
  to authenticated
  using (true);

comment on table  public.parking_requests is '외부인 차량 입차신청. INSERT는 /api/parking/request 경유(service_role).';
comment on column public.parking_requests.type        is 'regular(정기) | visitor(방문)';
comment on column public.parking_requests.expire_date is '만료일. regular=2999-12-31, visitor=visit_date+2일';
comment on column public.parking_requests.ip          is '신청자 IP (rate limit/감사용)';
