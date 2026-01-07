# Account Inactivity Management Implementation Guide

## Overview

This guide explains how to implement automatic account cleanup for Payroll-Jam:
- **Free tier accounts** are disabled after **60 days** of inactivity
- **Free tier accounts** are deleted after **90 days** of inactivity

## Part 1: Multiple Account Management (Already Deployed)

### How It Works

1. **Any account tier** can invite users to manage their Reseller account
2. **Invitees who already have a non-Reseller account** will be warned:
   - They can only manage one account unless they upgrade to Reseller
   - Invitation email includes upgrade prompt
3. **Reseller account owners** can manage multiple Reseller accounts

### Files Modified
- `services/inviteService.ts` - Enhanced validation logic
- Return value now includes `requiresUpgrade?: boolean`

## Part 2: Account Inactivity Tracking (SQL Setup)

### Step 1: Run the Initial Migration

Execute this in Supabase SQL Editor:

```sql
-- File: supabase_add_account_inactivity_tracking.sql
```

This adds:
- `last_active` TIMESTAMP - tracks last account activity
- `is_disabled` BOOLEAN - marks disabled accounts
- `disabled_at` TIMESTAMP - when account was disabled
- Automatic trigger to update `last_active` on any account update
- Indexes for efficient querying

## Part 2B: Create Postgres Functions (In Supabase)

Execute these in Supabase SQL Editor to create the RPC functions:

```sql
-- Function to disable inactive Free accounts (60+ days)
CREATE OR REPLACE FUNCTION disable_inactive_free_accounts()
RETURNS TABLE(id UUID, email TEXT, company_name TEXT, disabled_count INT) AS $$
DECLARE
  disabled_count INT := 0;
BEGIN
  UPDATE accounts
  SET 
    is_disabled = TRUE,
    disabled_at = NOW()
  WHERE
    subscription_plan = 'Free'
    AND is_disabled = FALSE
    AND last_active < NOW() - INTERVAL '60 days';
  
  GET DIAGNOSTICS disabled_count = ROW_COUNT;
  
  RETURN QUERY SELECT 
    a.id,
    a.email,
    a.company_name,
    disabled_count
  FROM accounts a
  WHERE a.subscription_plan = 'Free' AND a.is_disabled = TRUE
  LIMIT disabled_count;
END;
$$ LANGUAGE plpgsql;

-- Function to delete inactive Free accounts (90+ days)
CREATE OR REPLACE FUNCTION delete_inactive_free_accounts()
RETURNS TABLE(id UUID, email TEXT, company_name TEXT, deleted_count INT) AS $$
DECLARE
  deleted_count INT := 0;
BEGIN
  -- Delete account_members first (foreign key constraint)
  DELETE FROM account_members
  WHERE account_id IN (
    SELECT id FROM accounts
    WHERE 
      subscription_plan = 'Free'
      AND last_active < NOW() - INTERVAL '90 days'
  );

  -- Delete accounts
  DELETE FROM accounts
  WHERE 
    subscription_plan = 'Free'
    AND last_active < NOW() - INTERVAL '90 days'
  RETURNING id, email, company_name INTO STRICT id, email, company_name;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN QUERY SELECT id, email, company_name, deleted_count;
END;
$$ LANGUAGE plpgsql;
```

## Part 3: Deploy Edge Function (Optional - For Automated Cleanup)

The file `account_cleanup_edge_function.ts` is a Supabase Edge Function that:
- Runs on a schedule (every day via Cron)
- Disables Free accounts inactive 60+ days
- Deletes Free accounts inactive 90+ days
- Requires a secret token for authorization

### To Deploy:

1. Create `.env.local` with:
   ```
   SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   CLEANUP_SECRET=your_secret
   ```

2. Deploy to Supabase:
   ```bash
   supabase functions deploy account_cleanup
   ```

3. Set up Cron (in Supabase Dashboard):
   - Function: `account_cleanup`
   - Schedule: `0 2 * * *` (daily at 2 AM UTC)

## Part 4: Manual Cleanup (Alternative)

If you prefer manual cleanup, run these SQL scripts in Supabase:

### Disable (60 days):
```sql
-- File: supabase_disable_inactive_free_accounts.sql
```

### Delete (90 days):
```sql
-- File: supabase_delete_inactive_free_accounts.sql
```

## Testing

### Test Inactive Account Tracking

```sql
-- Check accounts and their activity
SELECT 
  id,
  company_name,
  subscription_plan,
  last_active,
  is_disabled,
  AGE(NOW(), last_active) as inactivity_duration
FROM accounts
ORDER BY last_active DESC;

-- Check disabled accounts
SELECT * FROM accounts WHERE is_disabled = TRUE;

-- Manually trigger cleanup for testing (adjust dates):
UPDATE accounts
SET last_active = NOW() - INTERVAL '65 days'
WHERE subscription_plan = 'Free' AND is_disabled = FALSE
LIMIT 1;
```

## Monitoring

### View Cleanup History

Create a log table to track cleanup operations:

```sql
CREATE TABLE IF NOT EXISTS account_cleanup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT, -- 'disabled' or 'deleted'
  account_id UUID REFERENCES accounts(id),
  email TEXT,
  company_name TEXT,
  reason TEXT,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Create trigger to log disabled accounts
CREATE OR REPLACE FUNCTION log_account_disabled()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_disabled = TRUE AND OLD.is_disabled = FALSE THEN
    INSERT INTO account_cleanup_log (action, account_id, email, company_name, reason)
    VALUES ('disabled', NEW.id, NEW.email, NEW.company_name, 'Inactivity: 60+ days');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_account_disabled
AFTER UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION log_account_disabled();
```

## RLS Policies

Ensure these policies are in place:

```sql
-- Prevent disabled accounts from being accessed
CREATE POLICY "disabled_accounts_read_denied"
ON accounts
FOR SELECT
TO authenticated
USING (is_disabled = FALSE OR owner_id = auth.uid());

-- Prevent disabled accounts from being updated
CREATE POLICY "disabled_accounts_update_denied"
ON accounts
FOR UPDATE
TO authenticated
USING (is_disabled = FALSE OR owner_id = auth.uid());
```

## Important Notes

⚠️ **Before deploying:**
- Test with a small subset of accounts first
- Backup your database
- Consider archiving deleted accounts instead of permanent deletion
- Set up monitoring/alerting for cleanup operations
- Consider notifying users before deletion (e.g., 7 days after disabling)

## Timeline

- **Day 0-60**: Account active normally
- **Day 60**: Account disabled (user can't login, see upgrade/payment reminder)
- **Day 60-90**: Account stays disabled
- **Day 90+**: Account permanently deleted from system

## Recovery

If an account is accidentally disabled:
```sql
UPDATE accounts
SET is_disabled = FALSE, disabled_at = NULL
WHERE id = 'account_uuid';
```

If an account is deleted, it cannot be recovered (permanent deletion). Consider implementing soft-delete if recovery is important.
