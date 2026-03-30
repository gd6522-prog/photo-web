create table if not exists store_master_sync_log (
  id bigserial primary key,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  upserted int,
  error_text text,
  log_tail text[]
);

alter table store_master_sync_log enable row level security;

create policy "service role full access"
  on store_master_sync_log
  for all
  to service_role
  using (true)
  with check (true);
