-- ==========================================
-- FINAL FIX: SIGNUP 400 ERRORS & LIVE GATEWAY
-- ==========================================

-- 1. EXPAND ALLOWED STATUSES
-- This fixes the 400 error when selecting Direct Deposit (which uses PENDING_PAYMENT)
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_status_check 
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING_PAYMENT'));

-- 2. UPDATE SECURE RPC
-- Updated to include email and phone, and to be more robust for new signups
CREATE OR REPLACE FUNCTION public.create_company_secure(
    p_company_id UUID,
    p_owner_id UUID,
    p_name TEXT,
    p_trn TEXT,
    p_address TEXT,
    p_status TEXT,
    p_plan TEXT,
    p_billing_cycle TEXT,
    p_employee_limit INTEGER,
    p_settings JSONB,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Security Check: owner_id must exist in EITHER auth.users OR app_users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner_id) 
       AND NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = p_owner_id) THEN
        RAISE EXCEPTION 'Access Denied: Owner ID % not found in auth.users or app_users', p_owner_id;
    END IF;

    INSERT INTO public.companies (
        id, 
        owner_id, 
        name, 
        trn, 
        address,
        email,
        phone,
        status, 
        plan, 
        billing_cycle, 
        employee_limit, 
        settings,
        created_at,
        updated_at
    ) VALUES (
        p_company_id, 
        p_owner_id, 
        p_name, 
        p_trn, 
        p_address, 
        p_email,
        p_phone,
        p_status, 
        p_plan, 
        p_billing_cycle, 
        p_employee_limit, 
        p_settings,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        name = EXCLUDED.name,
        owner_id = EXCLUDED.owner_id,
        email = COALESCE(EXCLUDED.email, companies.email),
        phone = COALESCE(EXCLUDED.phone, companies.phone),
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        settings = EXCLUDED.settings,
        updated_at = NOW();

    SELECT to_jsonb(c) INTO v_result FROM public.companies c WHERE id = p_company_id;
    return v_result;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create company via RPC: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_company_secure TO anon, authenticated, service_role;

-- 3. ENSURE GLOBAL CONFIG VIEW EXISTS
-- This allows anonymous users to see if the gateway is set to "live" vs "sandbox"
CREATE OR REPLACE VIEW public_settings AS
SELECT 
  id,
  config - 'dimepay' || jsonb_build_object('dimepay', 
    (config->'dimepay') - 'sandbox' - 'production' || 
    jsonb_build_object(
      'enabled', (config->'dimepay'->'enabled'),
      'environment', (config->'dimepay'->'environment'),
      'passFeesTo', (config->'dimepay'->'passFeesTo'),
      'sandbox', (config->'dimepay'->'sandbox') - 'secretKey',
      'production', (config->'dimepay'->'production') - 'secretKey'
    )
  ) as config,
  updated_at
FROM global_config;

GRANT SELECT ON public_settings TO anon, authenticated;

-- 4. INITIALIZE CONFIG IF MISSING (RE-RUN SAFE)
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

-- 5. VERIFY SETTINGS
SELECT id, config->'dimepay'->>'environment' as "Environment" FROM global_config;
