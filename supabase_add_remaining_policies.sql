-- Add RLS policies for all remaining tables
-- Run this in Supabase SQL Editor

-- First, enable RLS on remaining tables
ALTER TABLE pay_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE statutory_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_bank_details ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for all tables
DROP POLICY IF EXISTS "Allow public access" ON pay_run_items;
CREATE POLICY "Allow public access" ON pay_run_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON timesheet_entries;
CREATE POLICY "Allow public access" ON timesheet_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON allowances;
CREATE POLICY "Allow public access" ON allowances FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON deductions;
CREATE POLICY "Allow public access" ON deductions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON documents;
CREATE POLICY "Allow public access" ON documents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON document_templates;
CREATE POLICY "Allow public access" ON document_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON audit_logs;
CREATE POLICY "Allow public access" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON tax_configs;
CREATE POLICY "Allow public access" ON tax_configs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON integration_configs;
CREATE POLICY "Allow public access" ON integration_configs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON departments;
CREATE POLICY "Allow public access" ON departments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON designations;
CREATE POLICY "Allow public access" ON designations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON assets;
CREATE POLICY "Allow public access" ON assets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON asset_assignments;
CREATE POLICY "Allow public access" ON asset_assignments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON performance_reviews;
CREATE POLICY "Allow public access" ON performance_reviews FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON review_goals;
CREATE POLICY "Allow public access" ON review_goals FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON pricing_plans;
CREATE POLICY "Allow public access" ON pricing_plans FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON payment_records;
CREATE POLICY "Allow public access" ON payment_records FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON bank_files;
CREATE POLICY "Allow public access" ON bank_files FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON company_users;
CREATE POLICY "Allow public access" ON company_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON notifications;
CREATE POLICY "Allow public access" ON notifications FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON api_keys;
CREATE POLICY "Allow public access" ON api_keys FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON webhooks;
CREATE POLICY "Allow public access" ON webhooks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON payroll_settings;
CREATE POLICY "Allow public access" ON payroll_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON statutory_forms;
CREATE POLICY "Allow public access" ON statutory_forms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access" ON employee_bank_details;
CREATE POLICY "Allow public access" ON employee_bank_details FOR ALL USING (true) WITH CHECK (true);
