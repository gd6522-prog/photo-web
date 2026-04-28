-- 방문 신청자가 입력하는 "방문 목적" 컬럼 추가 (선택, sregist 미전송, 관리자 화면 전용)
alter table public.parking_requests
  add column if not exists visit_purpose text;

comment on column public.parking_requests.visit_purpose is '방문 목적 (방문 신청 전용, 외부 sregist에는 미전송)';
