-- hazards table + storage bucket/policies

create extension if not exists pgcrypto;

create table if not exists public.hazards (
  id uuid primary key default gen_random_uuid(),
  hazard_date date not null,
  before_path text not null,
  before_public_url text not null,
  before_memo text null,
  after_path text null,
  after_public_url text null,
  after_memo text null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  improved_by uuid null,
  improved_at timestamptz null
);

create index if not exists hazards_hazard_date_idx on public.hazards (hazard_date desc);
create index if not exists hazards_after_public_url_idx on public.hazards (after_public_url);
create index if not exists hazards_created_at_idx on public.hazards (created_at desc);

alter table public.hazards enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazards' and policyname = 'hazards_select_authenticated'
  ) then
    create policy hazards_select_authenticated
      on public.hazards
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazards' and policyname = 'hazards_insert_authenticated'
  ) then
    create policy hazards_insert_authenticated
      on public.hazards
      for insert
      to authenticated
      with check (auth.uid() = created_by);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazards' and policyname = 'hazards_update_authenticated'
  ) then
    create policy hazards_update_authenticated
      on public.hazards
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hazards' and policyname = 'hazards_delete_authenticated'
  ) then
    create policy hazards_delete_authenticated
      on public.hazards
      for delete
      to authenticated
      using (true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('hazards', 'hazards', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'hazards_public_read'
  ) then
    create policy hazards_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'hazards');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'hazards_auth_insert'
  ) then
    create policy hazards_auth_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'hazards');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'hazards_auth_update'
  ) then
    create policy hazards_auth_update
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'hazards')
      with check (bucket_id = 'hazards');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'hazards_auth_delete'
  ) then
    create policy hazards_auth_delete
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'hazards');
  end if;
end $$;
