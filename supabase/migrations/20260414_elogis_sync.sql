-- elogis 자동 동기화 작업 로그
create table if not exists elogis_sync_log (
  id           serial primary key,
  status       text not null default 'pending', -- pending | running | done | failed
  requested_at timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz,
  results      jsonb,   -- 파일별 결과: [{slotKey, label, ok, message}]
  error_text   text,
  log_tail     text[]
);

-- elogis 에이전트 heartbeat 상태
create table if not exists elogis_agent_status (
  id                 int primary key default 1,
  last_heartbeat_at  timestamptz
);

insert into elogis_agent_status (id) values (1) on conflict do nothing;
