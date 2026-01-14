-- Fix companies table schema and update secure RPC
-- This addresses the 400 Bad Request during signup by:
-- 1. Expanding the allowed status values to include PENDING_PAYMENT
-- 2. Updating the RPC to handle email and phone fields

-- Expand status check constraint
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_status_check 
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING_PAYMENT'));

-- Update the secure RPC to include email and phone
CREATE OR REPLACE FUNCTION create_company_secure(
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
    -- This is more robust during signup when both records are being created
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

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.create_company_secure TO anon, authenticated, service_role;

-- Log the change
INSERT INTO public.global_config (key, value)
VALUES ('schema_version_companies_fix', '"1.1"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
