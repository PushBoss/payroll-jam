-- Fix infinite recursion in app_users and companies RLS policies
-- The issue is policies are referencing the same table they're protecting

-- First, drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON app_users;
DROP POLICY IF EXISTS "Users can update own profile" ON app_users;
DROP POLICY IF EXISTS "Users can create own profile" ON app_users;
DROP POLICY IF EXISTS "Super admin can view all users" ON app_users;
DROP POLICY IF EXISTS "Super admin can update all users" ON app_users;
DROP POLICY IF EXISTS "Company admins can view company users" ON app_users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON app_users;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON app_users;
DROP POLICY IF EXISTS "Enable update for users based on auth_user_id" ON app_users;

DROP POLICY IF EXISTS "Companies are viewable by their members" ON companies;
DROP POLICY IF EXISTS "Companies are editable by OWNER" ON companies;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON companies;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON companies;
DROP POLICY IF EXISTS "Enable update for users based on id" ON companies;
DROP POLICY IF EXISTS "OWNER can create companies" ON companies;

-- Create simple, non-recursive policies for app_users
-- Policy 1: Users can do anything with their own record (using auth.uid() only)
CREATE POLICY "app_users_own_record" ON app_users
  FOR ALL
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Policy 2: Allow anyone authenticated to insert (needed for signup)
CREATE POLICY "app_users_insert_own" ON app_users
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

-- Create simple, non-recursive policies for companies
-- Policy 1: Anyone can insert (needed for signup)
CREATE POLICY "companies_insert" ON companies
  FOR INSERT
  WITH CHECK (true);

-- Policy 2: Users can view/update companies if their app_users.company_id matches
-- This is safe because we're checking the auth.uid() directly without recursion
CREATE POLICY "companies_access" ON companies
  FOR ALL
  USING (
    id IN (
      SELECT company_id 
      FROM app_users 
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_id 
      FROM app_users 
      WHERE auth_user_id = auth.uid()
    )
  );
