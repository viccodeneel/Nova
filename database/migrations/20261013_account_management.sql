-- Preserve existing accounts while adding NOVA-owned configuration and verified MT5 mode.
-- Legacy rows belong to the application's existing authenticated single-owner identity.
ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS owner_id VARCHAR(100) NOT NULL DEFAULT 'nova-owner';

ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS connection_mode VARCHAR(20);

ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS account_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
