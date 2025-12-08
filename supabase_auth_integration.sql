-- Integrate Supabase Auth with app_users table
-- Run this in Supabase SQL Editor

-- 1. Add auth_user_id column to link to auth.users
ALTER TABLE app_users 
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON app_users(auth_user_id);

-- 3. Update RLS policies to use authenticated users
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow public read app_users" ON app_users;
DROP POLICY IF EXISTS "Allow public insert app_users" ON app_users;
DROP POLICY IF EXISTS "Allow public update app_users" ON app_users;
DROP POLICY IF EXISTS "Allow public delete app_users" ON app_users;

-- Create new auth-based policies for app_users
CREATE POLICY "Users can view their own profile"
ON app_users FOR SELECT
USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can insert their own profile"
ON app_users FOR INSERT
WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "Users can update their own profile"
ON app_users FOR UPDATE
USING (auth.uid() = auth_user_id);

-- 4. Update companies policies
DROP POLICY IF EXISTS "Allow public read companies" ON companies;
DROP POLICY IF EXISTS "Allow public insert companies" ON companies;
DROP POLICY IF EXISTS "Allow public update companies" ON companies;
DROP POLICY IF EXISTS "Allow public delete companies" ON companies;

-- Allow users to see their own company
CREATE POLICY "Users can view their company"
ON companies FOR SELECT
USING (
  id IN (
    SELECT company_id FROM app_users WHERE auth_user_id = auth.uid()
  )
);

-- Allow users to create company during signup
CREATE POLICY "Users can insert company during signup"
ON companies FOR INSERT
WITH CHECK (true); -- Anyone can create a company (during signup)

-- Allow company owners to update their company
CREATE POLICY "Company owners can update their company"
ON companies FOR UPDATE
USING (
  id IN (
    SELECT company_id FROM app_users 
    WHERE auth_user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
  )
);

-- 5. Update employees table policies
DROP POLICY IF EXISTS "Allow public read employees" ON employees;
DROP POLICY IF EXISTS "Allow public insert employees" ON employees;
DROP POLICY IF EXISTS "Allow public update employees" ON employees;
DROP POLICY IF EXISTS "Allow public delete employees" ON employees;

CREATE POLICY "Users can view employees in their company"
ON employees FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM app_users WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage employees"
ON employees FOR ALL
USING (
  company_id IN (
    SELECT company_id FROM app_users 
    WHERE auth_user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
  )
);

-- 6. Function to automatically link auth user to app_users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new app_user is created, link it to auth user if IDs match
  IF NEW.id = auth.uid() THEN
    NEW.auth_user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON app_users;
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 7. Verify setup
SELECT 'Auth integration setup complete!' as status;

-- Check existing users
SELECT id, email, name, role, auth_user_id
FROM app_users
ORDER BY created_at DESC
LIMIT 5;
