-- Fix RLS policies to allow signup flow
-- Run this in Supabase SQL Editor

-- Allow authenticated users to insert their own app_users record
DROP POLICY IF EXISTS "Users can create their own profile" ON app_users;
CREATE POLICY "Users can create their own profile"
ON app_users FOR INSERT
WITH CHECK (auth_user_id = auth.uid());

-- Allow authenticated users to insert companies (for OWNER role during signup)
DROP POLICY IF EXISTS "Users can create companies" ON companies;
CREATE POLICY "Users can create companies"
ON companies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role IN ('OWNER', 'SUPER_ADMIN')
  )
);

-- Allow users to view companies they created or are associated with
DROP POLICY IF EXISTS "Users can view their company" ON companies;
CREATE POLICY "Users can view their company"
ON companies FOR SELECT
USING (
  id IN (
    SELECT company_id FROM app_users WHERE auth_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Verify policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('app_users', 'companies')
ORDER BY tablename, policyname;
