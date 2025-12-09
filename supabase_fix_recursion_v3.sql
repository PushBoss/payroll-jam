-- Fix infinite recursion by removing ALL policies temporarily
-- Then create the absolute simplest policies possible

-- Drop ALL policies
DROP POLICY IF EXISTS "app_users_own_record" ON app_users;
DROP POLICY IF EXISTS "app_users_insert_own" ON app_users;
DROP POLICY IF EXISTS "app_users_all_own" ON app_users;
DROP POLICY IF EXISTS "companies_insert" ON companies;
DROP POLICY IF EXISTS "companies_access" ON companies;
DROP POLICY IF EXISTS "companies_all_authenticated" ON companies;

-- Temporarily disable RLS to allow operations
-- (We'll re-enable with better policies)
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

-- Now re-enable RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create the simplest possible policies for app_users
-- Allow full access to authenticated users for their own records
CREATE POLICY "app_users_all_own" ON app_users
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Create the simplest possible policies for companies  
-- Allow authenticated users full access (we'll refine this later if needed)
CREATE POLICY "companies_all_authenticated" ON companies
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
