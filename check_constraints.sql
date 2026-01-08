-- Check constraints on account_members
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

-- Check if accounts table exists
SELECT count(*) as accounts_count FROM pg_tables WHERE tablename = 'accounts';
SELECT count(*) as companies_count FROM pg_tables WHERE tablename = 'companies';
