-- Fix Foreign Key on account_members table
-- The existing table references 'accounts' table, but we want it to reference 'companies' table.

-- 1. Drop the incorrect foreign key constraint
ALTER TABLE public.account_members
DROP CONSTRAINT IF EXISTS account_members_account_id_fkey;

-- 2. Add the correct foreign key constraint referencing companies
ALTER TABLE public.account_members
ADD CONSTRAINT account_members_account_id_fkey
FOREIGN KEY (account_id)
REFERENCES public.companies(id)
ON DELETE CASCADE;

-- 3. Verify the change by checking constraints
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM
    pg_constraint c
JOIN
    pg_namespace n ON n.oid = c.connamespace
WHERE
    n.nspname = 'public'
    AND conrelid::regclass::text = 'account_members';
