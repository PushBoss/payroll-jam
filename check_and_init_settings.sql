-- 1. Ensure the global_config table has the 'platform' row.
-- Without this, the view will be empty even if the table exists.

INSERT INTO global_config (id, config, updated_at)
SELECT 'platform', 
  jsonb_build_object(
    'dataSource', 'SUPABASE',
    'currency', 'JMD',
    'maintenanceMode', false,
    'dimepay', jsonb_build_object(
        'enabled', true,
        'environment', 'sandbox',
        'passFeesTo', 'MERCHANT',
        'sandbox', jsonb_build_object(
            'apiKey', 'ck_LGKMlNpFiRr63ce0s621VuGLjYdey',
            'secretKey', 'sk_rYoMG45jVM2gvhE-pm4to9EZoW9tD',
            'merchantId', 'mQn_iBSUd-KNq3K',
            'domain', 'https://staging.api.dimepay.app'
        ),
        'production', jsonb_build_object(
            'apiKey', '',
            'secretKey', '',
            'merchantId', '',
            'domain', 'https://api.dimepay.app'
        )
    )
  ),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM global_config WHERE id = 'platform');

-- 2. Verify settings
SELECT id, config->'dimepay'->>'environment' as active_env FROM global_config;
SELECT * FROM public_settings;
