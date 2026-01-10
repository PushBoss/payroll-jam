-- =====================================================
-- SQL TO DELETE TEST ACCOUNTS COMPLETELY
-- Run this in the Supabase Dashboard SQL Editor
-- =====================================================

-- 1. DELETE FROM AUTH (The root source)
-- This cascades to 'companies' (via owner_id) and 'app_users' (via auth_user_id)
-- Reference: supabase_add_owner_id_to_companies.sql and supabase_auth_integration.sql
DELETE FROM auth.users 
WHERE email IN (
  'aarongardiner6@gmail.com', 
  'info@pushtechsolutions.com'
);

-- 2. ORPHAN CLEANUP (Public Tables)
-- Just in case the cascade didn't catch everything (e.g. broken links)

-- Delete orphaned app_users
DELETE FROM public.app_users 
WHERE email IN (
  'aarongardiner6@gmail.com', 
  'info@pushtechsolutions.com'
);

-- Delete orphaned companies (where these emails are the contact email)
DELETE FROM public.companies 
WHERE email IN (
  'aarongardiner6@gmail.com', 
  'info@pushtechsolutions.com'
);

-- Delete orphaned reseller invites (where invite was sent to these emails)
DELETE FROM public.reseller_invites
WHERE invite_email IN (
  'aarongardiner6@gmail.com', 
  'info@pushtechsolutions.com'
);

-- =====================================================
-- QUICK CHECK
-- =====================================================
-- Verify they are gone
SELECT 'Auth Users Remaining' as check, count(*) FROM auth.users WHERE email IN ('aarongardiner6@gmail.com', 'info@pushtechsolutions.com');
SELECT 'App Users Remaining' as check, count(*) FROM public.app_users WHERE email IN ('aarongardiner6@gmail.com', 'info@pushtechsolutions.com');
