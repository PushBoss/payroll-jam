-- DEBUG USER STATE
-- Run this in the Supabase SQL Editor to see why your user cannot see their own company.

-- 1. Check your current Auth ID (Run this first, it might not work in SQL Editor but try)
-- SELECT auth.uid();

-- 2. Check app_users for your data
-- Replace the ID with yours if you know it, OR just search by email
SELECT id, email, company_id, role, name 
FROM public.app_users 
WHERE email = 'aarongardiner6@gmail.com'; -- <--- CHANGE THIS to your reseller email

-- 3. Check companies table
SELECT id, name, owner_id, email, plan 
FROM public.companies 
WHERE owner_id IN (SELECT id FROM public.app_users WHERE email = 'aarongardiner6@gmail.com');

-- 4. Check if the function works for you
-- (This might return NULL if run in SQL Editor as a superuser, it needs to be run as the user)
-- SELECT get_current_user_company_id();
