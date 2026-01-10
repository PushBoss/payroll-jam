-- PREVENT FUTURE BROKEN LINKS (DATA INTEGRITY)
-- This script updates your database constraints to ensure that deleting a User 
-- automatically deletes their data (Cascades), preventing "Zombie" records.

DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Updating app_users constraints...';
    
    -- 1. App Users: Remove old constraints linking to auth.users
    FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.app_users'::regclass AND confrelid = 'auth.users'::regclass) LOOP
        EXECUTE 'ALTER TABLE public.app_users DROP CONSTRAINT ' || quote_ident(r.conname);
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
    
    -- Add strict ON DELETE CASCADE
    ALTER TABLE public.app_users 
    ADD CONSTRAINT app_users_auth_id_fkey 
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Updating companies constraints...';

    -- 2. Companies: Remove old constraints linking to auth.users
    FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.companies'::regclass AND confrelid = 'auth.users'::regclass) LOOP
        EXECUTE 'ALTER TABLE public.companies DROP CONSTRAINT ' || quote_ident(r.conname);
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
    
    -- Add strict ON DELETE CASCADE
    ALTER TABLE public.companies 
    ADD CONSTRAINT companies_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    RAISE NOTICE '✅ Data Integrity enforced. Deleting a user will now cleanly wipe their data.';
END $$;
