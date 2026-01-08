-- Fix account_members schema to match the invitation system requirements
-- We need an 'email' column and a unique constraint on (account_id, email)

-- 1. Add 'email' column if it's missing (nullable at first to populate it if needed, but we'll make it required later if empty)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_members' AND column_name = 'email') THEN
        ALTER TABLE public.account_members ADD COLUMN email VARCHAR(255);
    END IF;
END $$;

-- 2. Drop the old unique constraint on (account_id, user_id) which is too restrictive for pending invites (where user_id is null)
ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_account_id_user_id_key;

-- 3. Add the new unique constraint on (account_id, email)
-- This ensures we don't invite the same email twice to the same company
ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_account_id_email_key; -- drop if exists to ensure we can recreate
ALTER TABLE public.account_members ADD CONSTRAINT account_members_account_id_email_key UNIQUE (account_id, email);

-- 4. Check if we need to fix the status column check constraint
-- Ensure status can be 'pending' or 'accepted'
ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_status_check;
ALTER TABLE public.account_members ADD CONSTRAINT account_members_status_check CHECK (status IN ('pending', 'accepted'));

-- 5. Show final structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'account_members';
