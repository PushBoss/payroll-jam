-- =====================================================
-- INVITATION SYSTEM SETUP
-- =====================================================
-- This file sets up the account_members table and related infrastructure
-- for the invitation-aware signup flow with email verification via invitation acceptance.

-- 1. CREATE ACCOUNT_MEMBERS TABLE (if it doesn't exist)
-- This table tracks team member invitations and access to companies
CREATE TABLE IF NOT EXISTS public.account_members (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_account_members_account_id ON public.account_members(account_id);
CREATE INDEX IF NOT EXISTS idx_account_members_user_id ON public.account_members(user_id);
CREATE INDEX IF NOT EXISTS idx_account_members_email ON public.account_members(email);
CREATE INDEX IF NOT EXISTS idx_account_members_status ON public.account_members(status);
CREATE INDEX IF NOT EXISTS idx_account_members_accepted ON public.account_members(accepted_at);

-- 2. DEPRECATE ACCOUNTS TABLE
-- Drop the trigger that auto-creates accounts table records (no longer used)
DROP TRIGGER IF EXISTS trigger_create_account_on_user_signup ON auth.users;
DROP FUNCTION IF EXISTS create_account_on_user_signup();

-- Note: The accounts table can be kept for backward compatibility or dropped entirely
-- For now, we'll leave it but remove references from the application code

-- 3. ENABLE RLS ON ACCOUNT_MEMBERS TABLE
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "account_members_view_own" ON public.account_members;
DROP POLICY IF EXISTS "account_members_insert_own_company" ON public.account_members;
DROP POLICY IF EXISTS "account_members_update_own" ON public.account_members;
DROP POLICY IF EXISTS "account_members_delete_own_company" ON public.account_members;

-- Users can view account_members for companies they own or are invited to
CREATE POLICY "account_members_view_own" ON public.account_members
  FOR SELECT
  USING (
    -- Can view if they own the company
    account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    OR
    -- Can view if they're a member (accepted) of the company
    user_id = auth.uid()
  );

-- Company owners can invite new members
CREATE POLICY "account_members_insert_own_company" ON public.account_members
  FOR INSERT
  WITH CHECK (
    account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

-- Company owners can update members (status, role)
CREATE POLICY "account_members_update_own_company" ON public.account_members
  FOR UPDATE
  USING (
    account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

-- Company owners can delete members
CREATE POLICY "account_members_delete_own_company" ON public.account_members
  FOR DELETE
  USING (
    account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

-- 4. UPDATE RLS ON COMPANIES TABLE
-- Companies should be visible to: owners, members, and resellers
DROP POLICY IF EXISTS "companies_select" ON public.companies;

CREATE POLICY "companies_select" ON public.companies
  FOR SELECT
  USING (
    -- Owner can see their company
    owner_id = auth.uid()
    OR
    -- User can see companies they're invited to (accepted members)
    id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
    OR
    -- Resellers can see companies where they are the reseller
    reseller_id = auth.uid()
  );

-- 5. UPDATE RLS ON EMPLOYEES TABLE
-- Employees should only be visible within their company
DROP POLICY IF EXISTS "employees_company_isolation" ON public.employees;

CREATE POLICY "employees_company_isolation" ON public.employees
  FOR SELECT
  USING (
    -- Can view employees in companies they own
    company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    OR
    -- Can view employees in companies they're invited to (accepted members)
    company_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

-- 6. GRANTS
-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_members TO authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT ON public.employees TO authenticated;

-- Grant full permissions to service role (used by backend)
GRANT ALL ON public.account_members TO service_role;
GRANT ALL ON public.companies TO service_role;
GRANT ALL ON public.employees TO service_role;

-- 7. TRIGGER FOR AUTO-UPDATE TIMESTAMPS
-- Create or replace the update_updated_at_column function
CREATE OR REPLACE FUNCTION update_account_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for account_members
DROP TRIGGER IF EXISTS account_members_updated_at_trigger ON public.account_members;
CREATE TRIGGER account_members_updated_at_trigger
BEFORE UPDATE ON public.account_members
FOR EACH ROW
EXECUTE FUNCTION update_account_members_updated_at();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE public.account_members IS 'Tracks team member invitations and access to companies. Users receive invitations at invite-send time (status: pending), and accept them during signup or later (status: accepted).';
COMMENT ON COLUMN public.account_members.account_id IS 'References the company the user is invited to manage (links to companies table)';
COMMENT ON COLUMN public.account_members.user_id IS 'References the app_user being invited (null until they sign up)';
COMMENT ON COLUMN public.account_members.email IS 'Email address of the invitee (denormalized for search and matching)';
COMMENT ON COLUMN public.account_members.role IS 'Role in the company: admin (full management) or manager (limited management)';
COMMENT ON COLUMN public.account_members.status IS 'pending (invite sent, not yet accepted) or accepted (user joined the company)';
COMMENT ON COLUMN public.account_members.accepted_at IS 'Timestamp when the user accepted the invitation (null if still pending)';
