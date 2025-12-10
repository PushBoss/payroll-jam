-- Drop ALL problematic policies that cause recursion
-- Keep only the simple "Allow public access" policies

-- Drop all app_users policies except the public one
DROP POLICY IF EXISTS "Super admins can update all users" ON app_users;
DROP POLICY IF EXISTS "Super admins can view all users" ON app_users;
DROP POLICY IF EXISTS "Users can create their own profile" ON app_users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON app_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON app_users;
DROP POLICY IF EXISTS "Users can view their own profile" ON app_users;
DROP POLICY IF EXISTS "app_users_all_own" ON app_users;

-- Drop all companies policies except the public one
DROP POLICY IF EXISTS "Company owners can update their company" ON companies;
DROP POLICY IF EXISTS "Super admins can update all companies" ON companies;
DROP POLICY IF EXISTS "Super admins can view all companies" ON companies;
DROP POLICY IF EXISTS "Users can create companies" ON companies;
DROP POLICY IF EXISTS "Users can insert company during signup" ON companies;
DROP POLICY IF EXISTS "Users can view their company" ON companies;
DROP POLICY IF EXISTS "companies_all_authenticated" ON companies;
DROP POLICY IF EXISTS "reseller_client_access" ON companies;

-- Drop all employees policies except the public one
DROP POLICY IF EXISTS "Admins can manage employees" ON employees;
DROP POLICY IF EXISTS "Super admins can manage all employees" ON employees;
DROP POLICY IF EXISTS "Super admins can view all employees" ON employees;
DROP POLICY IF EXISTS "Users can view employees in their company" ON employees;
DROP POLICY IF EXISTS "employees_company_isolation" ON employees;

-- Verify only "Allow public access" policies remain
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('app_users', 'companies', 'employees', 'leave_requests', 'pay_runs', 'timesheets')
ORDER BY tablename, policyname;
