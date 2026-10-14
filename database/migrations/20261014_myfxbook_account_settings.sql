ALTER TABLE app_profile
  ADD COLUMN IF NOT EXISTS provider_account_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
