create table if not exists public.vehicle_page_snapshots (
  snapshot_key text primary key,
  file_name text not null default '',
  product_rows jsonb not null default '[]'::jsonb,
  cargo_rows jsonb not null default '[]'::jsonb,
  large_limit integer null,
  small_limit integer null,
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

alter table public.vehicle_page_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_page_snapshots'
      and policyname = 'vehicle_page_snapshots_select_authenticated'
  ) then
    create policy vehicle_page_snapshots_select_authenticated
      on public.vehicle_page_snapshots
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_page_snapshots'
      and policyname = 'vehicle_page_snapshots_insert_authenticated'
  ) then
    create policy vehicle_page_snapshots_insert_authenticated
      on public.vehicle_page_snapshots
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_page_snapshots'
      and policyname = 'vehicle_page_snapshots_update_authenticated'
  ) then
    create policy vehicle_page_snapshots_update_authenticated
      on public.vehicle_page_snapshots
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_page_snapshots'
      and policyname = 'vehicle_page_snapshots_delete_authenticated'
  ) then
    create policy vehicle_page_snapshots_delete_authenticated
      on public.vehicle_page_snapshots
      for delete
      to authenticated
      using (true);
  end if;
end $$;
