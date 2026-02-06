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
