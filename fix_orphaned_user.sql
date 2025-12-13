-- Fix Orphaned User Profile
-- Run this in Supabase SQL Editor to create missing app_users profile

-- First, let's check for orphaned auth users (users in auth.users but not in app_users)
SELECT 
  au.id,
  au.email,
  au.created_at,
  CASE WHEN apu.id IS NULL THEN '❌ MISSING PROFILE' ELSE '✅ Has Profile' END as status
FROM 
  auth.users au
LEFT JOIN 
  app_users apu ON au.id = apu.id
WHERE 
  apu.id IS NULL;

-- To create the missing profile, you'll need to:
-- 1. Get the auth user's ID and email from the query above
-- 2. Get the company_id from the companies table (should have been created during signup)
-- 3. Run the INSERT below with the correct values

-- Example INSERT (replace with actual values):
/*
INSERT INTO app_users (
  id,                  -- Use the auth.users.id from query above
  email,              -- Use the email from auth.users
  name,               -- Use the name from signup
  role,               -- Usually 'OWNER' for paid signups
  company_id,         -- Get this from companies table where the user should own it
  is_onboarded,       -- FALSE for new signups
  preferences
) VALUES (
  'PASTE-AUTH-USER-ID-HERE',
  'user@example.com',
  'User Name',
  'OWNER',
  'PASTE-COMPANY-ID-HERE',
  FALSE,
  '{}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  company_id = EXCLUDED.company_id;
*/

-- Alternative: Find company by checking recent companies without users
SELECT 
  c.id as company_id,
  c.name as company_name,
  c.email as company_email,
  c.created_at,
  CASE WHEN apu.id IS NULL THEN '❌ NO USER' ELSE '✅ Has User' END as has_user
FROM 
  companies c
LEFT JOIN 
  app_users apu ON c.id = apu.company_id
WHERE 
  c.created_at > NOW() - INTERVAL '24 hours'
ORDER BY 
  c.created_at DESC;
