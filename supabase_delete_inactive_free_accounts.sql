-- Delete Free tier accounts after 90 days of inactivity
-- WARNING: This permanently deletes accounts and all their data
-- This is a maintenance script that should be run periodically via a Supabase Edge Function or scheduled job

-- First, collect IDs of accounts to be deleted (for audit logging)
-- SELECT id, email, company_name, last_active 
-- FROM accounts
-- WHERE 
--   subscription_plan = 'Free'
--   AND last_active < NOW() - INTERVAL '90 days'
-- LIMIT 100;  -- Be conservative with deletion

-- Delete account_members for these accounts first (due to foreign key constraints)
DELETE FROM account_members
WHERE account_id IN (
  SELECT id 
  FROM accounts
  WHERE 
    subscription_plan = 'Free'
    AND last_active < NOW() - INTERVAL '90 days'
);

-- Delete the accounts themselves
DELETE FROM accounts
WHERE 
  subscription_plan = 'Free'
  AND last_active < NOW() - INTERVAL '90 days'
RETURNING id, email, company_name, last_active;

-- Note: You may also want to delete related records from other tables:
-- - profiles (Supabase auth users) - be careful, should coordinate with auth system
-- - payment records - consider archiving instead of deleting
-- - audit logs - consider archiving instead of deleting
