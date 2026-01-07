-- Add inactivity tracking to accounts table
-- This enables automatic disabling/deletion of Free tier accounts after inactivity

-- Add columns if they don't exist
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP;

-- Create index for efficient querying of inactive accounts
CREATE INDEX IF NOT EXISTS idx_accounts_last_active ON accounts(last_active);
CREATE INDEX IF NOT EXISTS idx_accounts_is_disabled ON accounts(is_disabled);
CREATE INDEX IF NOT EXISTS idx_accounts_subscription_plan ON accounts(subscription_plan);

-- Update existing accounts to have last_active set to created_at if null
UPDATE accounts 
SET last_active = created_at 
WHERE last_active IS NULL;

-- Trigger to update last_active on account updates
CREATE OR REPLACE FUNCTION update_account_last_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_account_last_active ON accounts;
CREATE TRIGGER trigger_update_account_last_active
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION update_account_last_active();

-- Comment for documentation
COMMENT ON COLUMN accounts.last_active IS 'Last time the account was accessed or modified';
COMMENT ON COLUMN accounts.is_disabled IS 'Whether the account has been disabled due to inactivity';
COMMENT ON COLUMN accounts.disabled_at IS 'When the account was disabled';
