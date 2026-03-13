alter table public.store_map
  add column if not exists delivery_due_time text,
  add column if not exists address text;
