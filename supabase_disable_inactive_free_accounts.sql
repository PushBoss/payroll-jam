-- Disable Free tier accounts after 60 days of inactivity
-- This is a maintenance script that should be run periodically via a Supabase Edge Function or scheduled job

UPDATE accounts
SET 
  is_disabled = TRUE,
  disabled_at = NOW()
WHERE
  subscription_plan = 'Free'
  AND is_disabled = FALSE
  AND last_active < NOW() - INTERVAL '60 days'
RETURNING id, email, company_name, last_active, disabled_at;

-- Log the disabled accounts for monitoring
-- You can view the result in Supabase to verify which accounts were disabled
