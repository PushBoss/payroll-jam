-- Enable RLS with permissive policies (allows public access)
-- Run this in Supabase SQL Editor

-- Enable RLS on main tables
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- Create permissive policies that allow all operations
-- (For production, you should restrict these based on user authentication)

-- app_users policies
DROP POLICY IF EXISTS "Allow public access to app_users" ON app_users;
CREATE POLICY "Allow public access to app_users" ON app_users
  FOR ALL USING (true) WITH CHECK (true);

-- companies policies
DROP POLICY IF EXISTS "Allow public access to companies" ON companies;
CREATE POLICY "Allow public access to companies" ON companies
  FOR ALL USING (true) WITH CHECK (true);

-- employees policies
DROP POLICY IF EXISTS "Allow public access to employees" ON employees;
CREATE POLICY "Allow public access to employees" ON employees
  FOR ALL USING (true) WITH CHECK (true);

-- pay_runs policies
DROP POLICY IF EXISTS "Allow public access to pay_runs" ON pay_runs;
CREATE POLICY "Allow public access to pay_runs" ON pay_runs
  FOR ALL USING (true) WITH CHECK (true);

-- leave_requests policies
DROP POLICY IF EXISTS "Allow public access to leave_requests" ON leave_requests;
CREATE POLICY "Allow public access to leave_requests" ON leave_requests
  FOR ALL USING (true) WITH CHECK (true);

-- timesheets policies
DROP POLICY IF EXISTS "Allow public access to timesheets" ON timesheets;
CREATE POLICY "Allow public access to timesheets" ON timesheets
  FOR ALL USING (true) WITH CHECK (true);

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
