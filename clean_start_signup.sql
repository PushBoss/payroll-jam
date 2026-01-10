-- CLEAN START SCRIPT
-- Deletes a specific user (and all their data) so you can test signup again fresh.
-- Replace 'CLIENT_EMAIL_HERE' with the email of the account you want to wipe.

DO $$
DECLARE
    target_email TEXT := 'aarongardiner6@gmail.com'; -- <--- CHANGE THIS to the email you are testing
BEGIN
    RAISE NOTICE 'Starting clean wipe for email: %', target_email;

    -- 1. Delete invitiations (Reseller Invites) to this email
    DELETE FROM public.reseller_invites 
    WHERE invite_email = target_email;
    
    RAISE NOTICE 'Deleted pending invites.';

    -- 2. Delete Reseller Clients Links (where this email's company is the client)
    -- We need to find the company ID first, or just rely on cascade if we delete the company
    -- Explicit delete is safer for testing so we don't leave phantom records
    DELETE FROM public.reseller_clients
    WHERE client_company_id IN (
        SELECT id FROM public.companies WHERE email = target_email
    );
     -- Also delete if this user IS the reseller (unlikely for test client, but good hygiene)
     DELETE FROM public.reseller_clients
    WHERE reseller_id IN (
        SELECT id FROM public.companies WHERE email = target_email
    );

    RAISE NOTICE 'Deleted reseller links.';

    -- 3. Delete from public.app_users (Custom user table)
    DELETE FROM public.app_users 
    WHERE email = target_email;

    RAISE NOTICE 'Deleted app_users entry.';

    -- 4. Delete Companies owned by this email
    DELETE FROM public.companies 
    WHERE email = target_email;

    RAISE NOTICE 'Deleted companies.';

    -- 5. FINALLY: Delete from Supabase Auth (auth.users)
    -- This is the critical one that usually blocks re-signup ("User already registered")
    DELETE FROM auth.users 
    WHERE email = target_email;

    RAISE NOTICE 'Deleted auth user. Account wiped.';
END $$;
