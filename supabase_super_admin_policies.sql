-- Add Super Admin policies to allow full access
-- Run this in Supabase SQL Editor

-- Allow SUPER_ADMIN to view all companies
CREATE POLICY "Super admins can view all companies"
ON companies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Allow SUPER_ADMIN to view all users
CREATE POLICY "Super admins can view all users"
ON app_users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Allow SUPER_ADMIN to view all employees
CREATE POLICY "Super admins can view all employees"
ON employees FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Allow SUPER_ADMIN to manage all employees
CREATE POLICY "Super admins can manage all employees"
ON employees FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Allow SUPER_ADMIN to update any company
CREATE POLICY "Super admins can update all companies"
ON companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Allow SUPER_ADMIN to update any user
CREATE POLICY "Super admins can update all users"
ON app_users FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Verify policies created
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE policyname LIKE '%Super admin%'
ORDER BY tablename, policyname;
