create table if not exists store_master_agent_status (
  id int primary key default 1,
  last_heartbeat_at timestamptz,
  constraint single_row check (id = 1)
);

insert into store_master_agent_status (id, last_heartbeat_at)
values (1, null)
on conflict do nothing;

alter table store_master_agent_status enable row level security;

create policy "service role full access"
  on store_master_agent_status
  for all
  to service_role
  using (true)
  with check (true);
