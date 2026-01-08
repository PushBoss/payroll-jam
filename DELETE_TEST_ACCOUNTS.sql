-- =====================================================
-- DELETE TEST ACCOUNTS AND RELATED RECORDS
-- =====================================================
-- This script cleans up test accounts and all their related data

-- STEP 1: GET USER IDS (for reference)
SELECT id, email FROM public.app_users 
WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com');

-- STEP 2: DELETE ACCOUNT_MEMBERS (invitations) for these users
DELETE FROM public.account_members
WHERE user_id IN (
  SELECT id FROM public.app_users 
  WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
);

-- STEP 3: DELETE ACCOUNT_MEMBERS (invitations TO their companies)
DELETE FROM public.account_members
WHERE account_id IN (
  SELECT id FROM public.companies
  WHERE owner_id IN (
    SELECT id FROM public.app_users 
    WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
  )
);

-- STEP 4: DELETE EMPLOYEES in their companies (cascade should handle this)
DELETE FROM public.employees
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE owner_id IN (
    SELECT id FROM public.app_users 
    WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
  )
);

-- STEP 5: DELETE COMPANIES owned by these users
DELETE FROM public.companies
WHERE owner_id IN (
  SELECT id FROM public.app_users 
  WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
);

-- STEP 6: DELETE APP_USERS
DELETE FROM public.app_users
WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com');

-- STEP 7: DELETE FROM AUTH.USERS (must be done via Supabase Dashboard or admin API)
-- ⚠️ MANUAL STEP: Go to Supabase Dashboard → Authentication → Users
-- Find and delete the auth records for:
-- - info@pushtechsolutions.com
-- - aarongardiner6@gmail.com

-- VERIFY DELETION
SELECT 'Deleted successfully if no results below:' as status;

SELECT 'auth.users' as table_name, COUNT(*) as remaining_records
FROM public.app_users
WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')

UNION ALL

SELECT 'companies' as table_name, COUNT(*)
FROM public.companies
WHERE owner_id IN (
  SELECT id FROM public.app_users 
  WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
)

UNION ALL

SELECT 'account_members' as table_name, COUNT(*)
FROM public.account_members
WHERE user_id IN (
  SELECT id FROM public.app_users 
  WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
)
OR account_id IN (
  SELECT id FROM public.companies
  WHERE owner_id IN (
    SELECT id FROM public.app_users 
    WHERE email IN ('info@pushtechsolutions.com', 'aarongardiner6@gmail.com')
  )
);
