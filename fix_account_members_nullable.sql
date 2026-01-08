-- Final fix for account_members to match application expectations
-- The user_id column must be NULLABLE for pending invitations
-- The email column was added as text, but invitations system expects to insert pending users

-- 1. Make user_id nullable (CRITICAL for pending invites)
ALTER TABLE public.account_members ALTER COLUMN user_id DROP NOT NULL;

-- 2. Ensure email is not null (as per schema) - this seems already correct based on your output
-- ALTER TABLE public.account_members ALTER COLUMN email SET NOT NULL;

-- 3. Verify the change
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'account_members' AND column_name = 'user_id';
