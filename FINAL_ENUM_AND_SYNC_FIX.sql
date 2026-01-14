-- ==========================================
-- FINAL FIX: ENUM & CONSTRAINTS REPAIR
-- ==========================================

-- 1. IDENTIFY IF IT IS AN ENUM OR CHECK CONSTRAINT
-- We will just try to convert it to TEXT first to remove any restrictions
DO $$ 
BEGIN
    -- Remove check constraint if it exists (from old schema)
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check;
    
    -- If it's an enum, we need to convert the column to text temporarily
    -- This handles the case where 'member_role' is an enum type.
    -- We use 'USING role::text' to preserve data.
    ALTER TABLE public.account_members ALTER COLUMN role TYPE TEXT USING role::TEXT;
END $$;

-- 2. RE-CREATE THE ENUM (If we want to keep it typed) OR KEEP AS TEXT
-- For maximum safety and compatibility with current app state, 
-- we will use TEXT but add a flexible CHECK constraint.
ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check_v2;
ALTER TABLE public.account_members ADD CONSTRAINT account_members_role_check_v2 
    CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN', 'owner', 'admin', 'manager', 'employee'));


-- 3. REPAIR AARON'S MEMBERSHIPS (Fixed to match CHECK constraint)
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

    -- 4. LINK IN RESELLER_CLIENTS
    INSERT INTO public.reseller_clients (reseller_id, client_company_id, status, access_level)
    VALUES (v_aaron_company, v_client_company, 'ACTIVE', 'FULL')
    ON CONFLICT (reseller_id, client_company_id) DO NOTHING;

    -- 5. UPDATE CLIENT COMPANY'S RESELLER_ID
    UPDATE public.companies SET reseller_id = v_aaron_company WHERE id = v_client_company;
END $$;


-- 6. VERIFY RESULTS
SELECT 
    c.name as company_name, 
    am.email as member_email, 
    am.role, 
    am.status
FROM public.account_members am
JOIN public.companies c ON c.id = am.account_id
WHERE am.email = 'info@pushtechsolutions.com';
