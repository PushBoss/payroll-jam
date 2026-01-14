-- FIX DATABASE CONSTRAINTS AND SIGNUP FLOW STABILITY
-- This script relaxes constraints that are blocking the signup flow
-- and ensures 'owner_id' can be correctly linked.

DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Optimizing app_users and companies constraints...';
    
    -- 1. Companies Owner ID Constraint
    -- We'll make it reference app_users(id) instead of auth.users(id) 
    -- This ensures that as long as we create the profile first, the company link works.
    -- Better yet, we'll make it NULLABLE and not strictly enforced during the transaction.

    -- Drop old constraints (pointing to either auth.users or app_users)
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.companies'::regclass 
        AND (confrelid = 'auth.users'::regclass OR confrelid = 'public.app_users'::regclass)
    ) LOOP
        EXECUTE 'ALTER TABLE public.companies DROP CONSTRAINT ' || quote_ident(r.conname);
        RAISE NOTICE 'Dropped constraint: % from companies', r.conname;
    END LOOP;
    
    -- Re-add as a soft reference (or reference app_users if you prefer strictness)
    -- For maximum stability during signup, we'll point it to app_users(id)
    -- as we will change the code to create app_users first.
    ALTER TABLE public.companies 
    ADD CONSTRAINT companies_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.app_users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
    
    RAISE NOTICE '✅ Done. owner_id now references app_users(id) and is deferred.';
END $$;

-- 2. Ensure create_company_secure doesn't manually block
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
    -- RELAXED CHECK: allow if owner exists in EITHER auth.users OR app_users
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
        owner_id = EXCLUDED.owner_id, -- Ensure owner_id is updated if it was missing 
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
