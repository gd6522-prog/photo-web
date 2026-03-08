alter table public.profiles
add column if not exists is_company_admin boolean not null default false;

alter table public.profiles
add column if not exists is_general_admin boolean not null default false;

update public.profiles
set
  is_company_admin = true,
  work_part = case
    when trim(coalesce(work_part, '')) = '업체관리자' then '관리자'
    else work_part
  end
where trim(coalesce(work_part, '')) = '업체관리자';

update public.profiles
set is_general_admin = true
where coalesce(is_admin, false) = false
  and trim(coalesce(work_part, '')) in ('관리자', '일반관리자');
