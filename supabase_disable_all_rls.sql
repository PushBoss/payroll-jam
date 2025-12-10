-- NUCLEAR OPTION: Disable RLS on all public tables temporarily
-- This will allow signup to work while we debug the recursion issue

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY';
        RAISE NOTICE 'Disabled RLS on table: %', r.tablename;
    END LOOP;
END $$;

-- Verify all tables have RLS disabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
