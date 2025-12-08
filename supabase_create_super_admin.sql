-- Create Super Admin Users
-- Run this in Supabase SQL Editor
-- NOTE: Users must first sign up through the app to create auth.users entry
-- Then run this script to upgrade them to SUPER_ADMIN role

-- Option 1: Upgrade existing user to SUPER_ADMIN by email
UPDATE app_users 
SET role = 'SUPER_ADMIN'
WHERE email = 'aarongardiner6@gmail.com';

-- Option 2: Upgrade multiple users at once
UPDATE app_users 
SET role = 'SUPER_ADMIN'
WHERE email IN (
    'aarongardiner6@gmail.com',
    'admin@payrolljam.com',
    'super@payrolljam.com'
);

-- Option 3: Create a super admin user manually (if auth user exists)
-- First, the user MUST sign up through the app to create auth.users entry
-- Then you can insert into app_users:
/*
INSERT INTO app_users (id, email, name, role, auth_user_id, is_onboarded)
VALUES (
    'auth-user-uuid-here',  -- Get this from auth.users table
    'admin@example.com',
    'Super Admin',
    'SUPER_ADMIN',
    'auth-user-uuid-here',  -- Same UUID from auth.users
    true
)
ON CONFLICT (id) DO UPDATE
SET role = 'SUPER_ADMIN';
*/

-- Verify super admins
SELECT id, email, name, role, created_at
FROM app_users
WHERE role = 'SUPER_ADMIN'
ORDER BY created_at DESC;
