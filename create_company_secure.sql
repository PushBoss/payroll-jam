-- Secure RPC to create companies during signup (when session might be missing)
-- This allows creation even if auth.uid() is not yet established in the session but exists in auth.users

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
    p_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Security Check: owner_id must exist in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner_id) THEN
        RAISE EXCEPTION 'Access Denied: Owner ID not found';
    END IF;

    INSERT INTO public.companies (
        id, 
        owner_id, 
        name, 
        trn, 
        address, 
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

-- IMPORTANT: Grant execute to anon so it can be called during signup
GRANT EXECUTE ON FUNCTION create_company_secure TO anon, authenticated, service_role;
