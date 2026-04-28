-- sregist(주차관제) 자동등록 결과 추적용 컬럼 추가
alter table public.parking_requests
  add column if not exists sregist_registered boolean default false,
  add column if not exists sregist_registered_at timestamptz,
  add column if not exists sregist_response text;

comment on column public.parking_requests.sregist_registered    is 'sregist(주차관제) 자동등록 성공 여부';
comment on column public.parking_requests.sregist_registered_at is 'sregist 등록 성공 시각';
comment on column public.parking_requests.sregist_response      is 'sregist 응답 본문(또는 에러 메시지)';
