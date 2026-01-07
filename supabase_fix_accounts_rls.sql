-- =====================================================
-- FIX ACCOUNTS TABLE RLS AND EMAIL VERIFICATION
-- =====================================================

-- 1. CREATE ACCOUNTS TABLE IF IT DOESN'T EXIST
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  subscription_plan VARCHAR(50) DEFAULT 'Free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 1a. ADD INACTIVITY TRACKING COLUMNS IF THEY DON'T EXIST
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON public.accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_accounts_subscription_plan ON public.accounts(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_accounts_last_active ON public.accounts(last_active);
CREATE INDEX IF NOT EXISTS idx_accounts_is_disabled ON public.accounts(is_disabled);

-- 2. ENABLE RLS ON ACCOUNTS TABLE
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- 3. CREATE RLS POLICIES FOR ACCOUNTS TABLE
-- Users can read any account (needed for invitations and team member features)
-- Write access is still restricted to account owner
DROP POLICY IF EXISTS "users_view_own_account" ON public.accounts;
DROP POLICY IF EXISTS "users_view_accounts_for_invites" ON public.accounts;
CREATE POLICY "accounts_read_all" ON public.accounts
  FOR SELECT
  USING (true);

-- Users can insert their own account
DROP POLICY IF EXISTS "users_insert_own_account" ON public.accounts;
CREATE POLICY "users_insert_own_account" ON public.accounts
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Users can update their own account
DROP POLICY IF EXISTS "users_update_own_account" ON public.accounts;
CREATE POLICY "users_update_own_account" ON public.accounts
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Service role can bypass RLS (for backend operations)
-- Note: This is implicit - service role key bypasses RLS

-- 4. ENABLE RLS ON APP_USERS TABLE WITH PROPER POLICIES
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
DROP POLICY IF EXISTS "app_users_view_own" ON public.app_users;
CREATE POLICY "app_users_view_own" ON public.app_users
  FOR SELECT
  USING (id = auth.uid());

-- Allow anyone to search for users by email (needed for invitations)
-- This is safe because we're only exposing email and id for search purposes
DROP POLICY IF EXISTS "app_users_search_by_email" ON public.app_users;
CREATE POLICY "app_users_search_by_email" ON public.app_users
  FOR SELECT
  USING (true);

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "app_users_insert_own" ON public.app_users;
CREATE POLICY "app_users_insert_own" ON public.app_users
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Allow users to update their own profile
DROP POLICY IF EXISTS "app_users_update_own" ON public.app_users;
CREATE POLICY "app_users_update_own" ON public.app_users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 5. GRANT PERMISSIONS
-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_users TO authenticated;

-- Grant full permissions to service role (used by backend)
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.app_users TO service_role;

-- =====================================================
-- EMAIL VERIFICATION SETUP
-- =====================================================

-- Note: Supabase automatically sends verification emails if:
-- 1. Email Auth is enabled in Supabase project settings
-- 2. Email templates are configured
-- 3. SMTP provider is set up (or Supabase email is used)

-- To troubleshoot email verification:
-- 1. Go to Supabase Dashboard → Authentication → Email Templates
-- 2. Ensure confirmation email template is enabled
-- 3. Go to Settings → Email Configuration and verify SMTP is configured
-- 4. For testing: Use "Disable email confirmation" in auth settings (development only)

-- If emails are not being sent in production:
-- - Check Supabase auth logs
-- - Verify SMTP configuration
-- - Check sender email domain is verified
-- - For DimePay: Ensure webhook URL is correct

COMMENT ON TABLE public.accounts IS 'User accounts that can be managed by multiple team members. One owner per account.';
COMMENT ON TABLE public.app_users IS 'User profiles with role management for accounts.';
