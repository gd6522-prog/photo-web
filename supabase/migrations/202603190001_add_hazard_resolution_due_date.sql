alter table public.hazard_report_resolutions
add column if not exists planned_due_date date null;

create index if not exists hazard_report_resolutions_planned_due_date_idx
  on public.hazard_report_resolutions (planned_due_date);
