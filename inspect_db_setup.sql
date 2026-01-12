-- INSPECT TRIGGER AND CONSTRAINTS
-- Check the 'handle_new_user' trigger logic and foreign keys on app_users

-- 1. Get Trigger Code
select prosrc from pg_proc where proname = 'handle_new_user';

-- 2. Check Constraints on app_users
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.app_users'::regclass;
