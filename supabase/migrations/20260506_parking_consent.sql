-- 개인정보 수집·이용 동의 기록 (PIPA 준수)
alter table public.parking_requests
  add column if not exists consent_at timestamptz,
  add column if not exists consent_ip text;

comment on column public.parking_requests.consent_at is '개인정보 수집·이용 동의 시각 (PIPA 동의 증빙)';
comment on column public.parking_requests.consent_ip is '동의 시 신청자 IP (감사용)';
