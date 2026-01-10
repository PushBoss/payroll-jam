-- DIAGNOSTIC SCRIPT
-- Run this to understand why "Company Not Found" and "Cannot Delete Invite" are happening.

-- 1. Reseller (aarongardiner6@gmail.com) Check
-- We need to ensuring their 'auth_user_id' in app_users correctly links to auth.users
SELECT 'RESELLER CHECK' as section;
SELECT au.id as auth_id, au.email, pu.id as app_user_id, pu.auth_user_id as link_id, pu.company_id
FROM auth.users au
LEFT JOIN public.app_users pu ON pu.email = au.email
WHERE au.email = 'aarongardiner6@gmail.com';

-- Check Reseller Invites for this reseller
SELECT * FROM public.reseller_invites 
WHERE invite_email = 'aarongardiner6@gmail.com' OR reseller_id = (
    SELECT company_id 
    FROM public.app_users 
    WHERE email = 'aarongardiner6@gmail.com'
);

-- 2. Starter User (agardiner@pushtech.live) Check
-- Determining why they can't find their own company
SELECT 'STARTER CHECK' as section;
-- Get Auth Info
SELECT au.id as auth_id, au.email, pu.id as app_user_id, pu.auth_user_id as link_id
FROM auth.users au
LEFT JOIN public.app_users pu ON pu.email = au.email
WHERE au.email = 'agardiner@pushtech.live';

-- Get Company Info (Is it owned by auth_id?)
SELECT c.id, c.name, c.owner_id
FROM public.companies c
WHERE c.owner_id = (SELECT id FROM auth.users WHERE email = 'agardiner@pushtech.live');

-- 3. Check if get_current_user_company_id() logic would work
-- It requires app_users.auth_user_id to match auth.users.id
SELECT 
    CASE WHEN pu.auth_user_id = au.id THEN 'LINK OK' ELSE 'LINK BROKEN' END as link_status,
    pu.email
FROM auth.users au
JOIN public.app_users pu ON pu.email = au.email
WHERE au.email IN ('aarongardiner6@gmail.com', 'agardiner@pushtech.live');
