-- =====================================================
-- VERIFY INVITATION SYSTEM SETUP
-- =====================================================
-- Run this query in Supabase SQL Editor to verify the migration worked correctly

-- 1. CHECK IF ACCOUNT_MEMBERS TABLE EXISTS
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'account_members'
) as "account_members_table_exists";

-- 2. CHECK ACCOUNT_MEMBERS COLUMNS
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'account_members'
ORDER BY ordinal_position;

-- 3. CHECK INDEXES ON ACCOUNT_MEMBERS
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'account_members'
ORDER BY indexname;

-- 4. CHECK RLS STATUS ON ACCOUNT_MEMBERS
SELECT 
  'public' as schemaname,
  'account_members' as tablename,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'account_members' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) as rowsecurity;

-- 5. CHECK RLS POLICIES ON ACCOUNT_MEMBERS
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'account_members'
ORDER BY policyname;

-- 6. CHECK RLS POLICIES ON COMPANIES
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'companies'
ORDER BY policyname;

-- 7. CHECK IF TRIGGER WAS DROPPED (should return no rows)
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name = 'trigger_create_account_on_user_signup';

-- 8. CHECK IF FUNCTION WAS DROPPED (should return no rows)
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'create_account_on_user_signup';

-- 9. CHECK IF NEW TRIGGER EXISTS (should return row)
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name = 'account_members_updated_at_trigger';

-- 10. CHECK IF NEW FUNCTION EXISTS (should return row)
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'update_account_members_updated_at';

-- 11. SUMMARY - Run this to see all results at once
SELECT 
  'account_members table exists' as check_name,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_members')::text as result
UNION ALL
SELECT 
  'RLS enabled on account_members' as check_name,
  (SELECT relrowsecurity::text FROM pg_class WHERE relname='account_members' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
UNION ALL
SELECT 
  'account_members RLS policies count' as check_name,
  (SELECT COUNT(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='account_members')
UNION ALL
SELECT 
  'companies RLS policies count' as check_name,
  (SELECT COUNT(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='companies')
UNION ALL
SELECT 
  'Old trigger (create_account_on_user_signup) dropped' as check_name,
  (NOT EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name='trigger_create_account_on_user_signup'))::text
UNION ALL
SELECT 
  'New trigger (account_members_updated_at_trigger) created' as check_name,
  EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name='account_members_updated_at_trigger')::text
UNION ALL
SELECT 
  'account_members indexes created' as check_name,
  (SELECT COUNT(*)::text FROM pg_indexes WHERE schemaname='public' AND tablename='account_members')
ORDER BY check_name;
