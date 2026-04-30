-- 방문 신청 시 "바로입차" 여부. Y=true → 등록 직후 sregist 입구 게이트(GATE01) 자동 개방.
alter table public.parking_requests
  add column if not exists immediate_entry boolean,
  add column if not exists gate_opened boolean;

comment on column public.parking_requests.immediate_entry is '바로입차 신청 여부 (방문 전용). true=즉시 게이트 개방 시도, false=일반 신청.';
comment on column public.parking_requests.gate_opened     is 'sregist 게이트 개방 명령 성공 여부 (immediate_entry=true 일 때만 의미 있음).';
