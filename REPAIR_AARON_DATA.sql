-- ==========================================
-- EMERGENCY REPAIR: RESTORE AARON/RESELLER DATA
-- ==========================================

-- 1. Restore Aaron's correct Company and Role
-- This was likely corrupted by a "Save Profile" action during impersonation.
UPDATE public.app_users
SET 
    company_id = '72835f52-5fc0-4f38-ae30-975be6142b9d',
    role = 'RESELLER'
WHERE email = 'info@pushtechsolutions.com';

-- 2. Verify he is the owner of that company
UPDATE public.companies
SET owner_id = (SELECT id FROM public.app_users WHERE email = 'info@pushtechsolutions.com')
WHERE id = '72835f52-5fc0-4f38-ae30-975be6142b9d';

-- 3. Run the Portfolio Sync for him manually
-- Ensure he is a member of the client company he was impersonating
INSERT INTO public.account_members (account_id, user_id, email, role, status, accepted_at)
VALUES (
    '675ab0b8-da78-4764-a4c8-013747f1a790', -- Michael Jackson's Company
    (SELECT id FROM public.app_users WHERE email = 'info@pushtechsolutions.com'),
    'info@pushtechsolutions.com',
    'MANAGER', -- Uppercase as per our text conversion
    'accepted',
    NOW()
)
ON CONFLICT (account_id, email) DO UPDATE SET user_id = EXCLUDED.user_id, status = 'accepted';

-- 4. Link in reseller_clients
INSERT INTO public.reseller_clients (reseller_id, client_company_id, status, access_level)
VALUES ('72835f52-5fc0-4f38-ae30-975be6142b9d', '675ab0b8-da78-4764-a4c8-013747f1a790', 'ACTIVE', 'FULL')
ON CONFLICT (reseller_id, client_company_id) DO NOTHING;

-- 5. Update client's reseller pointer
UPDATE public.companies SET reseller_id = '72835f52-5fc0-4f38-ae30-975be6142b9d' WHERE id = '675ab0b8-da78-4764-a4c8-013747f1a790';

-- 6. Check results
SELECT u.email, u.role, u.company_id, c.name as company_name
FROM public.app_users u
LEFT JOIN public.companies c ON c.id = u.company_id
WHERE u.email = 'info@pushtechsolutions.com';

SELECT count(*) as portfolio_size 
FROM public.reseller_clients 
WHERE reseller_id = '72835f52-5fc0-4f38-ae30-975be6142b9d';
