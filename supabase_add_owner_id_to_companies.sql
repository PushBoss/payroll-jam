-- =====================================================
-- ADD OWNER_ID TO COMPANIES TABLE
-- =====================================================

-- Add owner_id column to track who created/owns the company
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON public.companies(owner_id);

-- =====================================================
-- SETUP RLS FOR COMPANIES TABLE
-- =====================================================

-- Enable RLS on companies table if not already enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Users can read any company (needed for invitations and team member features)
DROP POLICY IF EXISTS "companies_read_all" ON public.companies;
CREATE POLICY "companies_read_all" ON public.companies
  FOR SELECT
  USING (true);

-- Users can insert their own company (owner_id = auth.uid())
DROP POLICY IF EXISTS "companies_insert_own" ON public.companies;
CREATE POLICY "companies_insert_own" ON public.companies
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Users can update their own company
DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
CREATE POLICY "companies_update_own" ON public.companies
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Service role can bypass RLS (for backend operations)
-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

-- =====================================================
-- DISABLE REDUNDANT ACCOUNTS TABLE
-- =====================================================

-- Drop RLS policies from accounts table if they exist
DROP POLICY IF EXISTS "accounts_read_all" ON public.accounts;
DROP POLICY IF EXISTS "users_insert_own_account" ON public.accounts;
DROP POLICY IF EXISTS "users_update_own_account" ON public.accounts;

-- Disable RLS on accounts table (no longer used)
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;

-- Note: The accounts table can be dropped in a future migration if needed
-- For now, it's disabled to maintain backward compatibility
