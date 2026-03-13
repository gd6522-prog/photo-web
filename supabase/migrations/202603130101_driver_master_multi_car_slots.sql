alter table public.profiles
  add column if not exists car_no_2 text,
  add column if not exists car_no_3 text,
  add column if not exists car_no_4 text,
  add column if not exists delivery_type_2 text,
  add column if not exists delivery_type_3 text,
  add column if not exists delivery_type_4 text;
