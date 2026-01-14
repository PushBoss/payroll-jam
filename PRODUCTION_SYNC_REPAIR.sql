-- ==========================================
-- PRODUCTION REPAIR: ACCOUNT_MEMBERS & RESELLER SYNC
-- ==========================================

-- 1. FIX THE COLUMN TYPE AND CONSTRAINTS
-- This handles the "invalid input value for enum" error by simplifying to text
DO $$ 
BEGIN
    -- Ensure 'email' column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_members' AND column_name = 'email') THEN
        ALTER TABLE public.account_members ADD COLUMN email VARCHAR(255);
    END IF;

    -- Convert role to text to bypass restrictive enums
    ALTER TABLE public.account_members ALTER COLUMN role TYPE TEXT USING role::TEXT;
    
    -- Drop old check constraints
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check;
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check_v2;

    -- Drop old restrictive unique constraint
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_account_id_user_id_key;

    -- Add the correct constraint for the app's invitation/sync logic
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_account_id_email_key') THEN
        ALTER TABLE public.account_members ADD CONSTRAINT account_members_account_id_email_key UNIQUE (account_id, email);
    END IF;
END $$;


-- 2. REPAIR AARON'S MEMBERSHIPS (Manual Sync)
-- Replace with actual IDs from the logs
DO $$
DECLARE
    v_aaron_id UUID := '5fe092ff-eafe-4fd3-81fe-5b649f6474d6';
    v_aaron_email TEXT := 'info@pushtechsolutions.com';
    v_aaron_company UUID := '72835f52-5fc0-4f38-ae30-975be6142b9d';
    v_client_company UUID := '675ab0b8-da78-4764-a4c8-013747f1a790'; -- Michael Jackson's Company
BEGIN
    -- Link Aaron to his own company as OWNER
    INSERT INTO public.account_members (account_id, user_id, email, role, status, accepted_at)
    VALUES (v_aaron_company, v_aaron_id, v_aaron_email, 'OWNER', 'accepted', NOW())
    ON CONFLICT (account_id, email) DO UPDATE SET user_id = EXCLUDED.user_id, status = 'accepted', role = 'OWNER';

    -- Link Aaron to Michael Jackson's Company as MANAGER (client)
    INSERT INTO public.account_members (account_id, user_id, email, role, status, accepted_at)
    VALUES (v_client_company, v_aaron_id, v_aaron_email, 'MANAGER', 'accepted', NOW())
    ON CONFLICT (account_id, email) DO UPDATE SET user_id = EXCLUDED.user_id, status = 'accepted', role = 'MANAGER';

    -- 3. LINK IN RESELLER_CLIENTS
    INSERT INTO public.reseller_clients (reseller_id, client_company_id, status, access_level)
    VALUES (v_aaron_company, v_client_company, 'ACTIVE', 'FULL')
    ON CONFLICT (reseller_id, client_company_id) DO NOTHING;

    -- 4. UPDATE CLIENT COMPANY'S RESELLER_ID
    UPDATE public.companies SET reseller_id = v_aaron_company WHERE id = v_client_company;
END $$;


-- 5. VERIFY RESULTS
SELECT 
    c.name as company_name, 
    am.email as member_email, 
    am.role, 
    am.status
FROM public.account_members am
JOIN public.companies c ON c.id = am.account_id
WHERE am.email = 'info@pushtechsolutions.com';

SELECT 
    r.name as reseller_name, 
    c.name as client_name, 
    rc.status
FROM public.reseller_clients rc
JOIN public.companies r ON r.id = rc.reseller_id
JOIN public.companies c ON c.id = rc.client_company_id;
