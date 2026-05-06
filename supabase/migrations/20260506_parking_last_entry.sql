-- 마지막 입차 시각 (sregist 입차내역의 max in_time 기준, cron 으로 동기화)
alter table public.parking_requests
  add column if not exists last_entry_at timestamptz;

comment on column public.parking_requests.last_entry_at is
  'sregist 입차내역에서 동기화된 가장 최근 입차 시각. NULL = 입차 기록 없음.';

-- 30일 이상 미입차 여부를 함께 노출하는 view.
-- 정기/방문 모두 status=approved 이고, 승인 후 30일이 지났으며, 최근 30일간
-- 입차 기록이 없는 경우 stale 로 표시.
create or replace view public.parking_requests_with_stale as
select
  pr.*,
  (
    pr.status = 'approved'
    and pr.approved_at is not null
    and pr.approved_at < (now() - interval '30 days')
    and (pr.last_entry_at is null or pr.last_entry_at < (now() - interval '30 days'))
  ) as is_stale
from public.parking_requests pr;

grant select on public.parking_requests_with_stale to authenticated;
