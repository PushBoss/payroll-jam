-- FIX BROKEN USER LINKS (CRITICAL REPAIR)
-- This script re-syncs the mismatched UUIDs between Supabase Auth and your Public Data.
-- This mismatch is causing "Company Not Found", "Unauthorized", and permission errors.

DO $$
DECLARE
    r_user RECORD;
BEGIN
    FOR r_user IN SELECT id, email FROM auth.users WHERE email IN ('aarongardiner6@gmail.com', 'agardiner@pushtech.live')
    LOOP
        RAISE NOTICE 'Fixing links for email: % (Auth ID: %)', r_user.email, r_user.id;

        -- 1. Fix app_users link (Critical for RLS lookups)
        UPDATE public.app_users 
        SET auth_user_id = r_user.id 
        WHERE email = r_user.email;
        
        -- 2. Fix companies ownership (Critical for "Company Not Found" error)
        UPDATE public.companies
        SET owner_id = r_user.id
        WHERE email = r_user.email;

        -- 3. Fix any account_members records (If you are a member of teams)
        -- We update the user_id pointer to the new Auth ID
        UPDATE public.account_members
        SET user_id = r_user.id
        WHERE email = r_user.email;

        RAISE NOTICE '✅ Successfully repaired %', r_user.email;
    END LOOP;
END $$;
