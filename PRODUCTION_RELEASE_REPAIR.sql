-- =============================================================
-- PRODUCTION RELEASE REPAIR: RESELLERS & ACCOUNT SYNC
-- =============================================================

-- STEP 1: FIX SCHEMA CONSTRAINTS
-- Converts 'member_role' column to TEXT to allow 'RESELLER' and case-insensitive roles
-- This prevents the "invalid value for enum member_role" errors.
DO $$ 
BEGIN
    -- Remove old check constraint if it exists
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check;
    
    -- Convert column to TEXT if it's currently an enum
    ALTER TABLE public.account_members ALTER COLUMN role TYPE TEXT USING role::TEXT;
END $$;

-- Add a flexible check constraint that supports both UI and DB variants
ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check_v2;
ALTER TABLE public.account_members ADD CONSTRAINT account_members_role_check_v2 
    CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN', 'owner', 'admin', 'manager', 'employee'));

-- Ensure the unique constraint for portfolio sync exists
-- This allows the UPSERT logic in our code to work correctly
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'account_members_account_id_email_key'
    ) THEN
        ALTER TABLE public.account_members ADD CONSTRAINT account_members_account_id_email_key UNIQUE (account_id, email);
    END IF;
END $$;


-- STEP 2: RESTORE AARON'S CORE PROFILE
-- Fixes the "missing reseller company" issue caused by the impersonation bug
UPDATE public.app_users
SET 
    company_id = '72835f52-5fc0-4f38-ae30-975be6142b9d',
    role = 'RESELLER'
WHERE email = 'info@pushtechsolutions.com';


-- STEP 3: BULK SYNC ALL RESELLER PORTFOLIOS
-- This ensures every company with a reseller_id is visible to that reseller's owner
DO $$
DECLARE
    r RECORD;
    v_reseller_owner_id UUID;
    v_reseller_owner_email TEXT;
BEGIN
    FOR r IN (
        SELECT id as client_company_id, reseller_id, name as client_name
        FROM public.companies
        WHERE reseller_id IS NOT NULL
    ) LOOP
        -- Find the primary user of the RESELLER company
        SELECT id, email INTO v_reseller_owner_id, v_reseller_owner_email
        FROM public.app_users
        WHERE company_id = r.reseller_id
        AND role IN ('RESELLER', 'OWNER')
        LIMIT 1;

        IF v_reseller_owner_id IS NOT NULL THEN
            -- Link Reseller as Manager to client
            INSERT INTO public.account_members (
                account_id, user_id, email, role, status, accepted_at, invited_at
            ) VALUES (
                r.client_company_id, v_reseller_owner_id, v_reseller_owner_email, 
                'MANAGER', 'accepted', NOW(), NOW()
            )
            ON CONFLICT (account_id, email) DO UPDATE 
            SET user_id = EXCLUDED.user_id, status = 'accepted', role = 'MANAGER';

            -- Ensure reseller_clients record exists
            INSERT INTO public.reseller_clients (reseller_id, client_company_id, status, access_level)
            VALUES (r.reseller_id, r.client_company_id, 'ACTIVE', 'FULL')
            ON CONFLICT (reseller_id, client_company_id) DO NOTHING;
        END IF;
    END LOOP;
END $$;


-- STEP 4: VERIFICATION
SELECT 
    c_res.name as reseller_company,
    u.email as reseller_email,
    count(rc.client_company_id) as linked_clients
FROM public.companies c_res
JOIN public.app_users u ON u.company_id = c_res.id
LEFT JOIN public.reseller_clients rc ON rc.reseller_id = c_res.id
WHERE u.role IN ('RESELLER', 'OWNER', 'reseller', 'owner')
GROUP BY c_res.name, u.email;
