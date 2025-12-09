-- Fix infinite recursion in app_users RLS policies

-- Drop existing policies that might be causing recursion
DROP POLICY IF EXISTS "Users can view own profile" ON app_users;
DROP POLICY IF EXISTS "Users can update own profile" ON app_users;
DROP POLICY IF EXISTS "Users can create own profile" ON app_users;
DROP POLICY IF EXISTS "Super admin can view all users" ON app_users;
DROP POLICY IF EXISTS "Super admin can update all users" ON app_users;

-- Create simplified policies without recursion
-- Users can view their own profile (using auth.uid() directly, no joins)
CREATE POLICY "Users can view own profile" ON app_users
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON app_users
  FOR UPDATE
  USING (auth_user_id = auth.uid());

-- Users can insert their own profile during signup
CREATE POLICY "Users can create own profile" ON app_users
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

-- Super admin can view all users (check role directly from auth.jwt())
CREATE POLICY "Super admin can view all users" ON app_users
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role')::text = 'SUPER_ADMIN'
    OR auth_user_id = auth.uid()
  );

-- Super admin can update all users
CREATE POLICY "Super admin can update all users" ON app_users
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role')::text = 'SUPER_ADMIN'
    OR auth_user_id = auth.uid()
  );

-- Admin and Owner can view users in their company
CREATE POLICY "Company admins can view company users" ON app_users
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE id = app_users.company_id
    )
    OR auth_user_id = auth.uid()
  );
