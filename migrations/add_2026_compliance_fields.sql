-- Migration: Add 2026 Jamaica Compliance Fields to employees table
-- Purpose: Support new EmployeeManager component with enhanced fields
-- Date: February 5, 2026

BEGIN;

-- Add missing columns to employees table if they don't exist
ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS joining_date DATE COMMENT 'Date employee joined (for pro-rating calculations)',
  ADD COLUMN IF NOT EXISTS annual_leave INTEGER DEFAULT 14 COMMENT 'Annual leave entitlement in days',
  ADD COLUMN IF NOT EXISTS employee_type VARCHAR(50) DEFAULT 'FULL_TIME' COMMENT 'Employee type: FULL_TIME, PART_TIME, CONTRACTOR, STAFF',
  ADD COLUMN IF NOT EXISTS nht_status VARCHAR(50) DEFAULT 'PENDING' COMMENT 'NHT registration status: REGISTERED, EXEMPT, PENDING',
  ADD COLUMN IF NOT EXISTS nht_number VARCHAR(100) COMMENT 'NHT registration number',
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) COMMENT 'Employee phone number',
  ADD COLUMN IF NOT EXISTS address TEXT COMMENT 'Employee address',
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20) COMMENT 'Gender: MALE, FEMALE, OTHER',
  ADD COLUMN IF NOT EXISTS date_of_birth DATE COMMENT 'Date of birth',
  ADD COLUMN IF NOT EXISTS designation VARCHAR(255) COMMENT 'Job designation',
  ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500) COMMENT 'URL to profile image',
  ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255) COMMENT 'Emergency contact name and phone',
  ADD COLUMN IF NOT EXISTS custom_deductions JSONB DEFAULT '[]' COMMENT 'Array of custom deductions with tracking (FixedAmount, FixedTerm, TargetBalance)',
  ADD COLUMN IF NOT EXISTS leave_balance JSONB DEFAULT '{"vacation": 14, "sick": 3, "personal": 0}' COMMENT 'Leave balance tracking';

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
