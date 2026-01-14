-- ==========================================
-- MASTER REPAIR: RESELLERS & PORTFOLIOS
-- ==========================================

-- 1. RESTORE AARON/info@pushtechsolutions.com
-- (Fixes the "missing reseller" issue caused by Profile Save bug)
UPDATE public.app_users
SET 
    company_id = '72835f52-5fc0-4f38-ae30-975be6142b9d',
    role = 'RESELLER'
WHERE email = 'info@pushtechsolutions.com';


-- 2. ENSURE ALL RESELLER OWNERS ARE LINKED TO THEIR CLIENTS
-- This script finds any company that has a reseller_id,
-- then finds the owner of that reseller company,
-- and ensures that owner is a 'MANAGER' in the client's account_members.
DO $$
DECLARE
    r RECORD;
    v_reseller_owner_id UUID;
    v_reseller_owner_email TEXT;
BEGIN
    FOR r IN (
        -- Find all companies assigned to a reseller
        SELECT id as client_company_id, reseller_id, name as client_name
        FROM public.companies
        WHERE reseller_id IS NOT NULL
    ) LOOP
        -- Find the primary user (Owner or Reseller) of the RESELLER company
        SELECT id, email INTO v_reseller_owner_id, v_reseller_owner_email
        FROM public.app_users
        WHERE company_id = r.reseller_id
        AND role IN ('RESELLER', 'OWNER')
        LIMIT 1;

        IF v_reseller_owner_id IS NOT NULL THEN
            RAISE NOTICE 'Linking Reseller % (%) to Client % (%)', v_reseller_owner_email, r.reseller_id, r.client_name, r.client_company_id;
            
            -- Add as Manager to client's team
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


-- 3. FINAL VERIFICATION
SELECT 
    c_res.name as reseller_name,
    u.email as reseller_owner,
    count(rc.client_company_id) as client_count
FROM public.companies c_res
JOIN public.app_users u ON u.company_id = c_res.id
LEFT JOIN public.reseller_clients rc ON rc.reseller_id = c_res.id
WHERE u.role IN ('RESELLER', 'OWNER')
  AND c_res.id IN (SELECT DISTINCT reseller_id FROM public.companies WHERE reseller_id IS NOT NULL)
GROUP BY c_res.name, u.email;

-- Check a specific client for Aaron
SELECT c.name as client_name, am.role as aaron_role
FROM public.account_members am
JOIN public.companies c ON c.id = am.account_id
WHERE am.email = 'info@pushtechsolutions.com'
  AND am.role = 'MANAGER';
