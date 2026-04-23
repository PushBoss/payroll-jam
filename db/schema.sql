ûá'i¹^QB-- Add DimePay Subscription Tracking Fields
-- Migration for recurring billing integration
-- Date: 2025-01-09

-- Add subscription tracking fields to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS dimepay_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS dimepay_customer_id TEXT;

-- Add payment method details for display
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT,
ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;

-- Create index for fast lookups by DimePay subscription ID
CREATE INDEX IF NOT EXISTS idx_subscriptions_dimepay_id ON subscriptions(dimepay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dimepay_customer_id ON subscriptions(dimepay_customer_id);

-- Add comment
COMMENT ON COLUMN subscriptions.dimepay_subscription_id IS 'DimePay subscription identifier for recurring billing';
COMMENT ON COLUMN subscriptions.dimepay_customer_id IS 'DimePay customer identifier';
COMMENT ON COLUMN subscriptions.payment_method_last4 IS 'Last 4 digits of payment card';
COMMENT ON COLUMN subscriptions.payment_method_brand IS 'Card brand (visa, mastercard, etc)';

-- Update existing subscriptions to have default values (optional)
-- UPDATE subscriptions SET payment_method_last4 = '****' WHERE payment_method_last4 IS NULL;
-- Add avatar_url and phone columns to app_users table
ALTER TABLE app_users 
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create storage bucket for avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for avatars bucket
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');
-- Create dedicated global_config table for platform-wide settings
-- This fixes the issue where global config is stored in each company's settings
-- Date: 2025-01-09

-- Create global_config table
CREATE TABLE IF NOT EXISTS global_config (
  id TEXT PRIMARY KEY DEFAULT 'platform',  -- Single row for entire platform
  config JSONB NOT NULL DEFAULT '{}',      -- Stores all platform configuration
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,                         -- Track which super admin made changes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE global_config IS 'Platform-wide configuration shared across all super admin accounts';
COMMENT ON COLUMN global_config.config IS 'JSONB containing pricing plans, payment gateway credentials, email config, etc';
COMMENT ON COLUMN global_config.updated_by IS 'Super admin user ID who last updated the config';

-- Enable Row Level Security
ALTER TABLE global_config ENABLE ROW LEVEL SECURITY;

-- Policy: Only super admins can read global config
CREATE POLICY "Super admins can view global config"
ON global_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
);

-- Policy: Only super admins can update global config
CREATE POLICY "Super admins can update global config"
ON global_config
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
);

-- Insert default config (will be migrated from existing companies.settings)
-- Note: Run this after the table is created
INSERT INTO global_config (id, config, updated_at) 
VALUES (
  'platform',
  jsonb_build_object(
    'dataSource', 'SUPABASE',
    'currency', 'JMD',
    'maintenanceMode', false,
    'emailjs', jsonb_build_object(
      'serviceId', '',
      'templateId', '',
      'publicKey', ''
    ),
    'dimepay', jsonb_build_object(
      'enabled', true,
      'environment', 'sandbox',
      'sandbox', jsonb_build_object(
        'apiKey', 'ck_LGKMlNpFiRr63ce0s621VuGLjYdey',
        'secretKey', 'sk_rYoMG45jVM2gvhE-pm4to9EZoW9tD',
        'merchantId', 'mQn_iBSUd-KNq3K',
        'domain', 'https://staging.api.dimepay.app'
      ),
      'production', jsonb_build_object(
        'apiKey', '',
        'secretKey', '',
        'merchantId', '',
        'domain', 'https://api.dimepay.app'
      ),
      'passFeesTo', 'MERCHANT'
    ),
    'paypal', jsonb_build_object(
      'enabled', false,
      'mode', 'sandbox',
      'clientId', '',
      'secret', ''
    ),
    'stripe', jsonb_build_object(
      'enabled', false,
      'publishableKey', '',
      'secretKey', ''
    ),
    'manual', jsonb_build_object(
      'enabled', true,
      'instructions', 'Please wire funds to NCB Account 404-392-XXX. Ref: Company Name'
    ),
    'systemBanner', jsonb_build_object(
      'active', false,
      'message', 'System Maintenance Scheduled for 2 AM.',
      'type', 'INFO'
    ),
    'pricingPlans', jsonb_build_array(
      jsonb_build_object(
        'id', 'p1',
        'name', 'Free',
        'priceConfig', jsonb_build_object('type', 'free', 'monthly', 0, 'annual', 0),
        'description', 'For small businesses (<5 emp)',
        'limit', '5',
        'features', jsonb_build_array('Basic Payroll', 'Payslip PDF'),
        'cta', 'Start Free',
        'highlight', false,
        'color', 'bg-white',
        'textColor', 'text-gray-900',
        'isActive', true
      ),
      jsonb_build_object(
        'id', 'p2',
        'name', 'Starter',
        'priceConfig', jsonb_build_object('type', 'flat', 'monthly', 5000, 'annual', 50000),
        'description', 'Growing teams needing compliance',
        'limit', '25',
        'features', jsonb_build_array('S01/S02 Reports', 'ACH Bank Files', 'Email Support'),
        'cta', 'Get Started',
        'highlight', true,
        'color', 'bg-jam-black',
        'textColor', 'text-white',
        'isActive', true
      ),
      jsonb_build_object(
        'id', 'p3',
        'name', 'Pro',
        'priceConfig', jsonb_build_object('type', 'per_emp', 'monthly', 500, 'annual', 5000),
        'description', 'Larger organizations',
        'limit', 'Unlimited',
        'features', jsonb_build_array('GL Integration', 'Employee Portal', 'Advanced HR'),
        'cta', 'Get Started',
        'highlight', false,
        'color', 'bg-white',
        'textColor', 'text-gray-900',
        'isActive', true
      ),
      jsonb_build_object(
        'id', 'p4',
        'name', 'Reseller',
        'priceConfig', jsonb_build_object(
          'type', 'base',
          'monthly', 0,
          'annual', 0,
          'baseFee', 5000,
          'perUserFee', 500,
          'resellerCommission', 20
        ),
        'description', 'For Accountants & Payroll Bureaus',
        'limit', 'Unlimited',
        'features', jsonb_build_array('White Label', 'Client Management', '20% Commission'),
        'cta', 'Get Started',
        'highlight', false,
        'color', 'bg-gray-100',
        'textColor', 'text-gray-900',
        'isActive', true
      )
    )
  ),
  NOW()
)
ON CONFLICT (id) DO NOTHING;  -- Don't overwrite if already exists

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_global_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS global_config_updated_at ON global_config;
CREATE TRIGGER global_config_updated_at
  BEFORE UPDATE ON global_config
  FOR EACH ROW
  EXECUTE FUNCTION update_global_config_timestamp();

-- Create index for faster access (though there's only one row)
CREATE INDEX IF NOT EXISTS idx_global_config_updated_at ON global_config(updated_at DESC);
-- Create subscriptions table to track user plans
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'starter', 'professional', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
    billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'yearly')),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'JMD',
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create payment_history table to track all payments
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'JMD',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method TEXT DEFAULT 'card',
    transaction_id TEXT,
    invoice_number TEXT,
    description TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_company_id ON payment_history(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON payment_history(payment_date DESC);

-- Add updated_at trigger for subscriptions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their company's subscription"
    ON subscriptions FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM app_users 
            WHERE email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Super admins can view all subscriptions"
    ON subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can insert subscriptions"
    ON subscriptions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can update subscriptions"
    ON subscriptions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

-- RLS Policies for payment_history
CREATE POLICY "Users can view their company's payment history"
    ON payment_history FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM app_users 
            WHERE email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Super admins can view all payment history"
    ON payment_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can insert payment records"
    ON payment_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can update payment records"
    ON payment_history FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

-- Add subscription_id to companies table for quick lookup
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_subscription_id UUID REFERENCES subscriptions(id);
CREATE INDEX IF NOT EXISTS idx_companies_subscription ON companies(current_subscription_id);
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- Create new permissive policies for authenticated users
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');
-- 2025-12-19 00:00:00 UTC
-- Migration: create pay_run_snapshots table
-- Deploy notes:
-- - Run this against your Supabase/Postgres instance.
-- - Using Supabase CLI: `supabase db query migrations/20251219_000000_create_pay_run_snapshots.sql`
-- - Or with psql: `psql <connection-string> -f migrations/20251219_000000_create_pay_run_snapshots.sql`

BEGIN;

-- Adds a lightweight snapshot table for finalized pay runs to store a JSON snapshot
-- and a stable finalized token. This avoids changing the existing `pay_runs` unique
-- constraint while still allowing multiple logical snapshots per period.

CREATE TABLE IF NOT EXISTS pay_run_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pay_run_id UUID NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  finalized_token UUID NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot_data JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_run_snapshots_company ON pay_run_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_run_snapshots_token ON pay_run_snapshots(finalized_token);

-- Optional: Ensure only one snapshot per pay_run_id + finalized_token
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pay_run_snapshot_token ON pay_run_snapshots(pay_run_id, finalized_token);

COMMIT;

-- Down script (manual rollback):
-- DROP INDEX IF EXISTS uniq_pay_run_snapshot_token;
-- DROP INDEX IF EXISTS idx_pay_run_snapshots_token;
-- DROP INDEX IF EXISTS idx_pay_run_snapshots_company;
-- DROP TABLE IF EXISTS pay_run_snapshots;
-- Migration: Add 2026 Jamaica Compliance Fields to employees table
-- Purpose: Support new EmployeeManager component with enhanced fields
-- Date: February 5, 2026

BEGIN;

-- Add missing columns to employees table if they don't exist
ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS annual_leave INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS employee_type VARCHAR(50) DEFAULT 'FULL_TIME',
  ADD COLUMN IF NOT EXISTS nht_status VARCHAR(50) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS nht_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS designation VARCHAR(255),
  ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255),
  ADD COLUMN IF NOT EXISTS custom_deductions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS leave_balance JSONB DEFAULT '{"vacation": 14, "sick": 3, "personal": 0}';

-- Add column comments
COMMENT ON COLUMN public.employees.joining_date IS 'Date employee joined (for pro-rating calculations)';
COMMENT ON COLUMN public.employees.annual_leave IS 'Annual leave entitlement in days';
COMMENT ON COLUMN public.employees.employee_type IS 'Employee type: FULL_TIME, PART_TIME, CONTRACTOR, STAFF';
COMMENT ON COLUMN public.employees.nht_status IS 'NHT registration status: REGISTERED, EXEMPT, PENDING';
COMMENT ON COLUMN public.employees.nht_number IS 'NHT registration number';
COMMENT ON COLUMN public.employees.phone IS 'Employee phone number';
COMMENT ON COLUMN public.employees.address IS 'Employee address';
COMMENT ON COLUMN public.employees.gender IS 'Gender: MALE, FEMALE, OTHER';
COMMENT ON COLUMN public.employees.date_of_birth IS 'Date of birth';
COMMENT ON COLUMN public.employees.designation IS 'Job designation';
COMMENT ON COLUMN public.employees.profile_image_url IS 'URL to profile image';
COMMENT ON COLUMN public.employees.emergency_contact IS 'Emergency contact name and phone';
COMMENT ON COLUMN public.employees.custom_deductions IS 'Array of custom deductions with tracking (FixedAmount, FixedTerm, TargetBalance)';
COMMENT ON COLUMN public.employees.leave_balance IS 'Leave balance tracking';

-- Create indexes for new columns used in filtering
CREATE INDEX IF NOT EXISTS idx_employee_type ON public.employees(employee_type);
CREATE INDEX IF NOT EXISTS idx_nht_status ON public.employees(nht_status);
CREATE INDEX IF NOT EXISTS idx_joining_date ON public.employees(joining_date);

-- Add comment to table
COMMENT ON TABLE public.employees IS 'Employee records with 2026 Jamaica compliance fields for payroll processing';

-- Backfill joining_date with hire_date if joining_date is null
UPDATE public.employees
SET joining_date = hire_date::DATE
WHERE joining_date IS NULL AND hire_date IS NOT NULL;

-- Set default joining_date if both are null
UPDATE public.employees
SET joining_date = CURRENT_DATE
WHERE joining_date IS NULL;

-- Set all NULL employee_type to FULL_TIME
UPDATE public.employees
SET employee_type = 'FULL_TIME'
WHERE employee_type IS NULL;

-- Set all NULL nht_status to PENDING
UPDATE public.employees
SET nht_status = 'PENDING'
WHERE nht_status IS NULL;

-- Set all NULL annual_leave to 14
UPDATE public.employees
SET annual_leave = 14
WHERE annual_leave IS NULL;

COMMIT;
-- Migration: Remove unique constraint on pay_runs to allow multiple pay runs for the same period
-- This allows users to create multiple pay runs (especially drafts) for the same period

-- Drop the existing unique constraint
ALTER TABLE pay_runs DROP CONSTRAINT IF EXISTS unique_pay_run_period;

-- Optional: Add a partial unique constraint that only applies to FINALIZED pay runs
-- This prevents duplicate finalized pay runs but allows multiple drafts
-- Comment out the line below if you want to allow multiple finalized runs as well
-- ALTER TABLE pay_runs ADD CONSTRAINT unique_finalized_pay_run_period 
--   UNIQUE (company_id, period_start, period_end, pay_frequency, status) 
--   WHERE status = 'FINALIZED';

-- Add an index to improve query performance when looking up pay runs by period
CREATE INDEX IF NOT EXISTS idx_pay_runs_period ON pay_runs(company_id, period_start, period_end, pay_frequency);

-- Add a comment to the table explaining the change
COMMENT ON TABLE pay_runs IS 'Pay run records. Multiple pay runs can exist for the same period to support drafts and revisions.';
