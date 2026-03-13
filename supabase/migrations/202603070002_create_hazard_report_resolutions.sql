-- link admin improvements to app hazard reports

create table if not exists public.hazard_report_resolutions (
  report_id uuid primary key,
  after_path text null,
  after_public_url text null,
  after_memo text null,
  improved_by uuid null,
  improved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hazard_report_resolutions_improved_at_idx
  on public.hazard_report_resolutions (improved_at desc);

alter table public.hazard_report_resolutions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazard_report_resolutions' and policyname = 'hazard_report_resolutions_select_authenticated'
  ) then
    create policy hazard_report_resolutions_select_authenticated
      on public.hazard_report_resolutions
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazard_report_resolutions' and policyname = 'hazard_report_resolutions_insert_authenticated'
  ) then
    create policy hazard_report_resolutions_insert_authenticated
      on public.hazard_report_resolutions
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazard_report_resolutions' and policyname = 'hazard_report_resolutions_update_authenticated'
  ) then
    create policy hazard_report_resolutions_update_authenticated
      on public.hazard_report_resolutions
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazard_report_resolutions' and policyname = 'hazard_report_resolutions_delete_authenticated'
  ) then
    create policy hazard_report_resolutions_delete_authenticated
      on public.hazard_report_resolutions
      for delete
      to authenticated
      using (true);
  end if;
end $$;

create or replace function public.set_hazard_report_resolutions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_hazard_report_resolutions_updated_at on public.hazard_report_resolutions;
create trigger trg_hazard_report_resolutions_updated_at
before update on public.hazard_report_resolutions
for each row execute procedure public.set_hazard_report_resolutions_updated_at();
