-- Disable Row Level Security for all tables to allow public access
-- Run this in Supabase SQL Editor

-- Disable RLS on all main tables
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE pay_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE pay_run_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets DISABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE allowances DISABLE ROW LEVEL SECURITY;
ALTER TABLE deductions DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE tax_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE designations DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE review_goals DISABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE statutory_forms DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_bank_details DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'app_users', 'companies', 'employees', 'pay_runs', 'pay_run_items',
  'leave_requests', 'timesheets', 'timesheet_entries', 'allowances',
  'deductions', 'documents', 'document_templates', 'audit_logs'
)
ORDER BY tablename;
