-- app_settings: generic key-value settings store
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON app_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- dps_daily_completion: daily DPS work completion log
CREATE TABLE IF NOT EXISTS dps_daily_completion (
  work_date date PRIMARY KEY,
  completed_at timestamptz,
  snapshot jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE dps_daily_completion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON dps_daily_completion FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON dps_daily_completion FOR ALL TO service_role USING (true) WITH CHECK (true);
