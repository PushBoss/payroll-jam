-- Create a public view of global_config that redacts sensitive keys
-- This allows the signup page (anonymous users) to see the active environment 
-- and public API keys without exposing secret keys.

CREATE OR REPLACE VIEW public_settings AS
SELECT 
  id,
  config - 'dimepay' || jsonb_build_object('dimepay', 
    (config->'dimepay') - 'sandbox' - 'production' || 
    jsonb_build_object(
      'sandbox', (config->'dimepay'->'sandbox') - 'secretKey',
      'production', (config->'dimepay'->'production') - 'secretKey',
      'enabled', (config->'dimepay'->'enabled'),
      'environment', (config->'dimepay'->'environment'),
      'passFeesTo', (config->'dimepay'->'passFeesTo')
    )
  ) as config,
  updated_at
FROM global_config;

-- Grant access to the view
GRANT SELECT ON public_settings TO anon, authenticated;

-- Ensure the original table has RLS but also allow service role to bypass
-- (Super admins already have access via existing policy)

-- Also update existing "Super admins can view global config" to be more robust
DROP POLICY IF EXISTS "Super admins can view global config" ON global_config;
CREATE POLICY "Super admins can view global config"
ON global_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
);
