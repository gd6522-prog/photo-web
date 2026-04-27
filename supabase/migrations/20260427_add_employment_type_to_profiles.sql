-- 고용형태 구분: 정규직(regular) / 임시직(temporary)
-- 임시직은 상세근태에서 제외하고 기본근태에서만 노출.
alter table public.profiles
  add column if not exists employment_type text;

comment on column public.profiles.employment_type is '고용형태: regular(정규직) | temporary(임시직). null = 미설정(정규직 취급).';

create index if not exists idx_profiles_employment_type on public.profiles(employment_type);
