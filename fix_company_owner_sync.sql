-- FIX COMPANY OWNER SYNC
-- Aligns app_users.auth_user_id, companies.owner_id, and account_members.user_id
-- for all existing users. Prevents "Company not found" caused by stale UUIDs.

DO $$
DECLARE
    repaired_count INTEGER := 0;
BEGIN
    -- 1. Ensure every app_users row points to the current auth.users id
    UPDATE public.app_users u
    SET auth_user_id = au.id
    FROM auth.users au
    WHERE lower(u.email) = lower(au.email)
      AND (u.auth_user_id IS DISTINCT FROM au.id);
    GET DIAGNOSTICS repaired_count = ROW_COUNT;
    RAISE NOTICE 'Updated % app_users rows', repaired_count;

    -- 2. Bring companies.owner_id in sync using the linked app_users row
    UPDATE public.companies c
    SET owner_id = au.id
    FROM public.app_users u
    JOIN auth.users au ON lower(au.email) = lower(u.email)
    WHERE u.company_id = c.id
      AND c.owner_id IS DISTINCT FROM au.id;
    GET DIAGNOSTICS repaired_count = ROW_COUNT;
    RAISE NOTICE 'Updated % companies rows', repaired_count;

    -- 3. Update account_members.user_id for any invites/memberships tied to email
    UPDATE public.account_members m
    SET user_id = au.id
    FROM auth.users au
    WHERE lower(m.email) = lower(au.email)
      AND (m.user_id IS DISTINCT FROM au.id);
    GET DIAGNOSTICS repaired_count = ROW_COUNT;
    RAISE NOTICE 'Updated % account_members rows', repaired_count;

    RAISE NOTICE 'Company owner sync complete.';
END $$;
