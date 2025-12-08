-- =====================================================
-- PAYROLL JAM - COMPLETE SUPABASE DATABASE SCHEMA
-- Jamaican Payroll Management System
-- Created: December 2025
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Companies (Multi-tenant root)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  trn TEXT, -- Tax Registration Number
  address TEXT,
  phone TEXT,
  email TEXT,
  industry TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  plan TEXT DEFAULT 'Free' CHECK (plan IN ('Free', 'Starter', 'Professional', 'Enterprise')),
  billing_cycle TEXT DEFAULT 'MONTHLY',
  employee_limit INTEGER DEFAULT 5,
  settings JSONB DEFAULT '{}'::JSONB,
  reseller_id UUID, -- Reference to reseller company if applicable
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users/Authentication
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN')),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  phone TEXT,
  avatar_url TEXT,
  is_onboarded BOOLEAN DEFAULT FALSE,
  preferences JSONB DEFAULT '{}'::JSONB,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Personal Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  address TEXT,
  emergency_contact JSONB, -- {name, relationship, phone}
  
  -- Tax & Statutory IDs
  trn TEXT, -- Tax Registration Number (format: XXX-XXX-XXX)
  nis TEXT, -- National Insurance Scheme number
  
  -- Employment Details
  employee_number TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING_ONBOARDING', 'PENDING_VERIFICATION', 'ON_LEAVE', 'TERMINATED', 'ARCHIVED')),
  role TEXT,
  hire_date DATE,
  probation_end_date DATE,
  job_title TEXT,
  department TEXT,
  manager_id UUID REFERENCES employees(id),
  work_location TEXT,
  employment_type TEXT CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN')),
  
  -- Compensation
  pay_data JSONB DEFAULT '{}'::JSONB, -- {grossSalary, hourlyRate, payType, payFrequency, currency}
  allowances JSONB DEFAULT '[]'::JSONB, -- Array of {name, amount, taxable, frequency}
  deductions JSONB DEFAULT '[]'::JSONB, -- Array of {name, amount, frequency}
  pension_contribution_rate NUMERIC(5,2) DEFAULT 0.00,
  
  -- Banking
  bank_details JSONB, -- {bankName, accountNumber, accountType, branchCode, currency}
  
  -- Leave Balances
  leave_balance JSONB DEFAULT '{"vacation": 0, "sick": 0, "personal": 0}'::JSONB,
  
  -- Onboarding
  onboarding_token TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  
  -- Termination
  termination_details JSONB, -- {date, reason, payoutVacationDays, severanceAmount, p45Generated}
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_employee_number UNIQUE (company_id, employee_number)
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  manager_id UUID REFERENCES employees(id),
  budget NUMERIC(12,2),
  gl_account_code TEXT, -- General Ledger account for expenses
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_dept_name UNIQUE (company_id, name)
);

-- =====================================================
-- PAYROLL TABLES
-- =====================================================

-- Pay Runs (Payroll Processing Sessions)
CREATE TABLE IF NOT EXISTS pay_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Period Information
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PROCESSING', 'FINALIZED', 'CANCELLED')),
  
  -- Summary Totals
  total_gross NUMERIC(12,2) DEFAULT 0,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  total_net NUMERIC(12,2) DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  
  -- Line Items (Detailed breakdown per employee)
  line_items JSONB DEFAULT '[]'::JSONB, -- Array of PayRunLineItem objects
  
  -- Employer Costs
  employer_contributions JSONB DEFAULT '{}'::JSONB, -- {totalNIS, totalNHT, totalEdTax, totalHEART}
  
  -- Processing
  processed_by UUID REFERENCES app_users(id),
  approved_by UUID REFERENCES app_users(id),
  finalized_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_pay_run_period UNIQUE (company_id, period_start, period_end, pay_frequency)
);

-- Pay Run Line Items (Individual employee payslip data)
CREATE TABLE IF NOT EXISTS pay_run_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pay_run_id UUID NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  
  -- Earnings
  gross_salary NUMERIC(10,2) NOT NULL,
  additions JSONB DEFAULT '[]'::JSONB, -- Array of {name, amount, taxable}
  total_earnings NUMERIC(10,2) NOT NULL,
  
  -- Deductions
  deductions JSONB DEFAULT '[]'::JSONB, -- Array of {name, amount}
  
  -- Statutory Deductions (Employee)
  nis NUMERIC(10,2) DEFAULT 0,
  nht NUMERIC(10,2) DEFAULT 0,
  education_tax NUMERIC(10,2) DEFAULT 0,
  paye NUMERIC(10,2) DEFAULT 0,
  
  -- Employer Contributions (for tracking)
  employer_nis NUMERIC(10,2) DEFAULT 0,
  employer_nht NUMERIC(10,2) DEFAULT 0,
  employer_education_tax NUMERIC(10,2) DEFAULT 0,
  employer_heart NUMERIC(10,2) DEFAULT 0,
  
  -- Totals
  total_deductions NUMERIC(10,2) NOT NULL,
  net_pay NUMERIC(10,2) NOT NULL,
  
  -- Overrides & Adjustments
  is_gross_overridden BOOLEAN DEFAULT FALSE,
  original_gross NUMERIC(10,2),
  is_tax_overridden BOOLEAN DEFAULT FALSE,
  tax_override_reason TEXT,
  
  -- YTD Tracking
  ytd_gross NUMERIC(12,2) DEFAULT 0,
  ytd_nis NUMERIC(12,2) DEFAULT 0,
  ytd_paye NUMERIC(12,2) DEFAULT 0,
  
  -- Payment Details
  bank_name TEXT,
  account_number TEXT,
  payment_method TEXT DEFAULT 'BANK_TRANSFER',
  payment_reference TEXT,
  payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_pay_run_employee UNIQUE (pay_run_id, employee_id)
);

-- YTD (Year-to-Date) Summary Table
CREATE TABLE IF NOT EXISTS employee_ytd (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL, -- e.g., 2025
  
  -- Cumulative Earnings
  ytd_gross NUMERIC(12,2) DEFAULT 0,
  ytd_taxable_gross NUMERIC(12,2) DEFAULT 0,
  
  -- Cumulative Deductions (Employee)
  ytd_nis NUMERIC(12,2) DEFAULT 0,
  ytd_nht NUMERIC(12,2) DEFAULT 0,
  ytd_education_tax NUMERIC(12,2) DEFAULT 0,
  ytd_paye NUMERIC(12,2) DEFAULT 0,
  ytd_pension NUMERIC(12,2) DEFAULT 0,
  
  -- Cumulative Employer Contributions
  ytd_employer_nis NUMERIC(12,2) DEFAULT 0,
  ytd_employer_nht NUMERIC(12,2) DEFAULT 0,
  ytd_employer_education_tax NUMERIC(12,2) DEFAULT 0,
  ytd_employer_heart NUMERIC(12,2) DEFAULT 0,
  
  -- Period Tracking
  periods_paid INTEGER DEFAULT 0,
  last_pay_date DATE,
  
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_employee_year UNIQUE (employee_id, tax_year)
);

-- =====================================================
-- TIME & ATTENDANCE TABLES
-- =====================================================

-- Timesheets
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Period
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  
  -- Hours
  total_regular_hours NUMERIC(5,2) DEFAULT 0,
  total_overtime_hours NUMERIC(5,2) DEFAULT 0,
  
  -- Entries
  entries JSONB DEFAULT '[]'::JSONB, -- Array of {date, regularHours, overtimeHours, notes}
  
  -- Status & Approval
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_employee_week UNIQUE (employee_id, week_start_date)
);

-- Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT,
  
  -- Leave Details
  type TEXT NOT NULL CHECK (type IN ('VACATION', 'SICK', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'PERSONAL', 'UNPAID')),
  start_date DATE,
  end_date DATE,
  requested_dates JSONB, -- Array of specific date strings for non-contiguous leave
  approved_dates JSONB, -- Array of approved dates (supports partial approval)
  total_days INTEGER,
  reason TEXT,
  
  -- Status & Approval
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Attachments (e.g., medical certificates)
  attachments JSONB, -- Array of {name, url, type}
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- COMPLIANCE & REPORTING TABLES
-- =====================================================

-- Statutory Reports (S01, S02, P24, P25)
CREATE TABLE IF NOT EXISTS statutory_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Report Type
  report_type TEXT NOT NULL CHECK (report_type IN ('S01', 'S02', 'P24', 'P25')),
  
  -- Period
  period_month INTEGER, -- 1-12 for S01
  period_year INTEGER NOT NULL,
  
  -- Employee (for P24, P25)
  employee_id UUID REFERENCES employees(id),
  
  -- Report Data
  report_data JSONB NOT NULL, -- Full report content
  
  -- Status
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'GENERATED', 'FILED', 'AMENDED')),
  generated_by UUID REFERENCES app_users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  filed_at TIMESTAMPTZ,
  filing_reference TEXT,
  
  -- File Storage
  file_url TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance Deadlines
CREATE TABLE IF NOT EXISTS compliance_deadlines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Deadline Details
  deadline_type TEXT NOT NULL, -- 'S01', 'S02', 'NIS', 'NHT', etc.
  due_date DATE NOT NULL,
  period_month INTEGER,
  period_year INTEGER NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'OVERDUE', 'WAIVED')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES app_users(id),
  
  -- Reminder
  reminder_sent BOOLEAN DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DOCUMENT MANAGEMENT TABLES
-- =====================================================

-- Document Templates (Job letters, contracts, etc.)
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Template Details
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('JOB_LETTER', 'EMPLOYMENT_CONTRACT', 'TERMINATION', 'SALARY_CERTIFICATE', 'OTHER')),
  description TEXT,
  
  -- Content
  content TEXT NOT NULL, -- HTML or Markdown with {{placeholders}}
  placeholders JSONB, -- Array of available placeholder fields
  
  -- Access
  is_global BOOLEAN DEFAULT FALSE, -- Available to all companies
  requires_approval BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Requests (Employee requests for documents)
CREATE TABLE IF NOT EXISTS document_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Request Details
  template_id UUID REFERENCES document_templates(id),
  document_type TEXT NOT NULL,
  purpose TEXT, -- Why the employee needs this document
  
  -- Status
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'GENERATED', 'DELIVERED')),
  
  -- Approval Workflow
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Generated Document
  generated_content TEXT,
  file_url TEXT,
  generated_at TIMESTAMPTZ,
  
  -- Delivery
  delivery_method TEXT DEFAULT 'EMAIL', -- 'EMAIL', 'DOWNLOAD', 'PRINT'
  delivered_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- RESELLER & BILLING TABLES
-- =====================================================

-- Reseller Clients (Accountants managing multiple companies)
CREATE TABLE IF NOT EXISTS reseller_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reseller_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Relationship
  relationship_start_date DATE DEFAULT CURRENT_DATE,
  relationship_end_date DATE,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TERMINATED')),
  
  -- Billing
  monthly_base_fee NUMERIC(10,2) DEFAULT 3000.00, -- JMD
  per_employee_fee NUMERIC(10,2) DEFAULT 100.00, -- JMD
  discount_rate NUMERIC(5,2) DEFAULT 0.00,
  
  -- Access
  access_level TEXT DEFAULT 'FULL' CHECK (access_level IN ('VIEW_ONLY', 'MANAGE', 'FULL')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_reseller_client UNIQUE (reseller_id, client_company_id)
);

-- Subscription Billing
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Plan Details
  plan_name TEXT NOT NULL,
  billing_cycle TEXT DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('MONTHLY', 'ANNUAL')),
  
  -- Pricing
  base_price NUMERIC(10,2) NOT NULL,
  per_employee_price NUMERIC(10,2) DEFAULT 0,
  current_employee_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  
  -- Payment
  payment_method TEXT, -- 'CREDIT_CARD', 'BANK_TRANSFER', 'INVOICE'
  payment_provider TEXT, -- 'STRIPE', 'DIME_PAY', etc.
  payment_provider_id TEXT,
  last_payment_date DATE,
  next_billing_date DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  
  -- Invoice Details
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  
  -- Line Items
  line_items JSONB NOT NULL, -- Array of {description, quantity, unitPrice, amount}
  
  -- Amounts
  subtotal NUMERIC(10,2) NOT NULL,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED')),
  paid_at TIMESTAMPTZ,
  
  -- Payment
  payment_method TEXT,
  payment_reference TEXT,
  
  -- Files
  pdf_url TEXT,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- AUDIT & SECURITY TABLES
-- =====================================================

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Actor
  actor_id UUID REFERENCES app_users(id),
  actor_name TEXT,
  actor_role TEXT,
  
  -- Action
  action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'APPROVE', 'EXPORT', etc.
  entity TEXT, -- 'EMPLOYEE', 'PAY_RUN', 'LEAVE_REQUEST', etc.
  entity_id UUID,
  
  -- Details
  description TEXT NOT NULL,
  changes JSONB, -- Before/after values for updates
  
  -- Context
  ip_address TEXT,
  user_agent TEXT,
  
  -- Metadata
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- System Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  
  -- Notification Details
  type TEXT NOT NULL, -- 'LEAVE_REQUEST', 'PAY_RUN_READY', 'COMPLIANCE_DEADLINE', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Action
  action_url TEXT,
  action_label TEXT,
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Priority
  priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ADDITIONAL FEATURES
-- =====================================================

-- Employee Assets (Laptops, phones, etc.)
CREATE TABLE IF NOT EXISTS employee_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Asset Details
  asset_type TEXT NOT NULL, -- 'LAPTOP', 'PHONE', 'VEHICLE', 'OTHER'
  asset_name TEXT NOT NULL,
  serial_number TEXT,
  model TEXT,
  purchase_date DATE,
  purchase_value NUMERIC(10,2),
  
  -- Assignment
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  status TEXT DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'RETURNED', 'DAMAGED', 'LOST')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Review Period
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  review_type TEXT, -- 'ANNUAL', 'PROBATION', 'MID_YEAR', etc.
  
  -- Reviewer
  reviewer_id UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  
  -- Ratings
  ratings JSONB, -- {category: score} e.g., {quality: 4, teamwork: 5}
  overall_rating NUMERIC(3,2),
  
  -- Feedback
  strengths TEXT,
  areas_for_improvement TEXT,
  goals TEXT,
  manager_comments TEXT,
  employee_comments TEXT,
  
  -- Status
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'ACKNOWLEDGED')),
  employee_acknowledged_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Assistant Usage Tracking
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  
  -- Query
  query TEXT NOT NULL,
  response TEXT,
  
  -- Tokens
  tokens_used INTEGER DEFAULT 0,
  
  -- Context
  context_type TEXT, -- 'PAYROLL', 'TAX', 'LABOUR_LAW', 'DRAFT_DOCUMENT'
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expert Referrals ("Ask an Expert" feature)
CREATE TABLE IF NOT EXISTS expert_referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  
  -- Referral Details
  question TEXT NOT NULL,
  category TEXT, -- 'TAX', 'LABOUR_LAW', 'PAYROLL', 'COMPLIANCE'
  urgency TEXT DEFAULT 'NORMAL' CHECK (urgency IN ('LOW', 'NORMAL', 'HIGH')),
  
  -- Expert Assignment
  assigned_reseller_id UUID REFERENCES companies(id),
  assigned_expert_id UUID REFERENCES app_users(id),
  assigned_at TIMESTAMPTZ,
  
  -- Response
  expert_response TEXT,
  responded_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'RESPONDED', 'CLOSED')),
  
  -- Follow-up
  converted_to_client BOOLEAN DEFAULT FALSE,
  conversion_date DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Companies
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_reseller ON companies(reseller_id);

-- Users
CREATE INDEX idx_users_company ON app_users(company_id);
CREATE INDEX idx_users_role ON app_users(role);
CREATE INDEX idx_users_email ON app_users(email);

-- Employees
CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_trn ON employees(trn);
CREATE INDEX idx_employees_nis ON employees(nis);
CREATE INDEX idx_employees_hire_date ON employees(hire_date);

-- Pay Runs
CREATE INDEX idx_pay_runs_company ON pay_runs(company_id);
CREATE INDEX idx_pay_runs_status ON pay_runs(status);
CREATE INDEX idx_pay_runs_period ON pay_runs(period_start, period_end);
CREATE INDEX idx_pay_runs_pay_date ON pay_runs(pay_date);

-- Pay Run Line Items
CREATE INDEX idx_line_items_pay_run ON pay_run_line_items(pay_run_id);
CREATE INDEX idx_line_items_employee ON pay_run_line_items(employee_id);

-- YTD
CREATE INDEX idx_ytd_employee_year ON employee_ytd(employee_id, tax_year);

-- Timesheets
CREATE INDEX idx_timesheets_employee ON timesheets(employee_id);
CREATE INDEX idx_timesheets_status ON timesheets(status);
CREATE INDEX idx_timesheets_week ON timesheets(week_start_date);

-- Leave Requests
CREATE INDEX idx_leave_company ON leave_requests(company_id);
CREATE INDEX idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_status ON leave_requests(status);
CREATE INDEX idx_leave_dates ON leave_requests(start_date, end_date);

-- Audit Logs
CREATE INDEX idx_audit_company ON audit_logs(company_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(is_read, created_at DESC);

-- Reseller Clients
CREATE INDEX idx_reseller_clients_reseller ON reseller_clients(reseller_id);
CREATE INDEX idx_reseller_clients_client ON reseller_clients(client_company_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_run_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_ytd ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE statutory_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

-- Example RLS Policy for employees table
-- Users can only see employees in their own company
CREATE POLICY employees_company_isolation ON employees
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM app_users WHERE id = auth.uid()
    )
  );

-- Resellers can see their client companies
CREATE POLICY reseller_client_access ON companies
  FOR SELECT
  USING (
    id IN (
      SELECT client_company_id FROM reseller_clients 
      WHERE reseller_id IN (SELECT company_id FROM app_users WHERE id = auth.uid())
    )
    OR
    id IN (SELECT company_id FROM app_users WHERE id = auth.uid())
  );

-- =====================================================
-- TRIGGERS FOR AUTO-UPDATES
-- =====================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_users_updated_at BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pay_runs_updated_at BEFORE UPDATE ON pay_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheets_updated_at BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to calculate next S01 deadline
CREATE OR REPLACE FUNCTION get_next_s01_deadline(period_year INTEGER, period_month INTEGER)
RETURNS DATE AS $$
BEGIN
  -- S01 is due on the 14th of the month following the pay period
  RETURN DATE(period_year || '-' || period_month || '-01') + INTERVAL '1 month' + INTERVAL '13 days';
END;
$$ LANGUAGE plpgsql;

-- Function to check employee limit for company
CREATE OR REPLACE FUNCTION check_employee_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  limit_count INTEGER;
BEGIN
  SELECT COUNT(*), c.employee_limit 
  INTO current_count, limit_count
  FROM employees e
  JOIN companies c ON e.company_id = c.id
  WHERE e.company_id = NEW.company_id 
    AND e.status IN ('ACTIVE', 'PENDING_ONBOARDING', 'PENDING_VERIFICATION')
  GROUP BY c.employee_limit;
  
  IF current_count >= limit_count THEN
    RAISE EXCEPTION 'Employee limit reached for this company plan';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_employee_limit_trigger
  BEFORE INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION check_employee_limit();

-- =====================================================
-- INITIAL DATA / SEED DATA
-- =====================================================

-- Insert default document templates
INSERT INTO document_templates (name, category, content, is_global, requires_approval)
VALUES 
  ('Standard Job Letter', 'JOB_LETTER', 
   '<h1>To Whom It May Concern</h1><p>This is to certify that {{employeeName}} has been employed with {{companyName}} since {{hireDate}} in the position of {{jobTitle}}.</p><p>Current Gross Salary: {{grossSalary}}</p>',
   TRUE, TRUE),
  ('Salary Certificate', 'SALARY_CERTIFICATE',
   '<h1>Salary Verification</h1><p>Employee: {{employeeName}}<br>Position: {{jobTitle}}<br>Monthly Gross Salary: {{grossSalary}}<br>Employment Status: {{status}}</p>',
   TRUE, TRUE);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
