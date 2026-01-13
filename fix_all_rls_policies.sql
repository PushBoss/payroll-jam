-- Comprehensive RLS policy fix - FINAL STABILITY VERSION
-- Fixes "infinite recursion" by using SECURITY DEFINER helper functions.
-- These functions bypass RLS to check relationships without triggering circular loops.

-- 0. Helper Functions (SECURITY DEFINER)
-- These allow us to perform lookups across tables without triggering RLS recursively.

-- Explicitly drop functions CASCADE to clear dependent policies on other tables (like employees)
DROP FUNCTION IF EXISTS public.check_is_accepted_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_is_account_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_is_company_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_is_reseller_for(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_has_access_to_user_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_has_access_to_pay_run(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.check_is_accepted_member(p_account_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Basic membership check
  RETURN EXISTS (
    SELECT 1 FROM public.account_members 
    WHERE account_id = p_account_id 
    AND user_id = auth.uid() 
    AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_is_account_admin(p_account_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin check
  RETURN EXISTS (
    SELECT 1 FROM public.account_members 
    WHERE account_id = p_account_id 
    AND user_id = auth.uid() 
    AND role = 'admin' 
    AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_is_company_owner(p_account_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Ownership check
  RETURN EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = p_account_id 
    AND owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_is_reseller_for(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_my_company_id UUID;
BEGIN
    -- 1. Find the company OWNED by the current user (if they are a reseller)
    SELECT id INTO v_my_company_id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1;
    
    IF v_my_company_id IS NULL THEN RETURN FALSE; END IF;

    -- 2. Check if that company is the reseller for the target account
    -- Checked in companies table directly
    RETURN EXISTS (
        SELECT 1 FROM public.companies 
        WHERE id = p_account_id 
        AND reseller_id = v_my_company_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_has_access_to_user_profile(p_target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. My own profile
  IF p_target_user_id = auth.uid() THEN RETURN TRUE; END IF;

  -- 2. Shared company authority
  RETURN EXISTS (
    SELECT 1 FROM public.account_members am_target
    JOIN public.account_members am_me ON am_me.account_id = am_target.account_id
    WHERE am_target.user_id = p_target_user_id 
    AND am_me.user_id = auth.uid()
    AND (
      am_me.status = 'accepted'
      OR
      public.check_is_company_owner(am_target.account_id)
      OR
      public.check_is_reseller_for(am_target.account_id)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_has_access_to_pay_run(p_pay_run_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT company_id INTO v_company_id FROM public.pay_runs WHERE id = p_pay_run_id;
    IF v_company_id IS NULL THEN RETURN FALSE; END IF;
    
    RETURN (
        public.check_is_company_owner(v_company_id) 
        OR public.check_is_accepted_member(v_company_id) 
        OR public.check_is_reseller_for(v_company_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.check_is_accepted_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_account_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_company_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_reseller_for(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_has_access_to_user_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_has_access_to_pay_run(UUID) TO authenticated;

-- 1. Drop all existing policies on companies (clean slate)
DROP POLICY IF EXISTS "Allow public access to companies" ON public.companies;
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_own" ON public.companies;
DROP POLICY IF EXISTS "companies_read_all" ON public.companies;
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;
DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
DROP POLICY IF EXISTS "Super admins can view all companies" ON public.companies;
DROP POLICY IF EXISTS "Super admins can update all companies" ON public.companies;

-- 2. Drop all policies on account_members
DROP POLICY IF EXISTS "account_members_insert" ON public.account_members;
DROP POLICY IF EXISTS "account_members_select" ON public.account_members;
DROP POLICY IF EXISTS "account_members_update" ON public.account_members;
DROP POLICY IF EXISTS "account_members_delete" ON public.account_members;

-- 2.1 Drop policies on reseller tables (ensure reseller flow is stable)
DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_delete" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_clients_select" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_insert" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_update" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_delete" ON public.reseller_clients;
DROP POLICY IF EXISTS "Allow authenticated users to insert reseller_clients" ON public.reseller_clients;
DROP POLICY IF EXISTS "Allow clients to view their reseller link" ON public.reseller_clients;

-- 3. Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;

-- 4. Create clean, non-recursive policies for companies
-- SELECT: Owner can see their company, members can see invited companies, resellers can see their clients
CREATE POLICY "companies_select" ON public.companies
  FOR SELECT
  USING (
    -- Owner can see their company directly
    owner_id = auth.uid()
    OR
    -- User is an accepted member (checked via helper to avoid recursion)
    check_is_accepted_member(id)
    OR
    -- Current user's company is the reseller for this company
    check_is_reseller_for(id)
  );

-- INSERT: Authenticated users can create companies they own
CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

-- UPDATE: Owners can update their companies
CREATE POLICY "companies_update" ON public.companies
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 5. Create policies for account_members
-- SELECT: Users can see invitations sent to them, OR if they have authority over the company
CREATE POLICY "account_members_select" ON public.account_members
  FOR SELECT
  USING (
    -- 1. My own invitation (by ID or email)
    user_id = auth.uid()
    OR
    email = auth.jwt()->>'email'
    OR
    -- 2. I have authority over the account (checked via helpers to avoid recursion)
    check_is_company_owner(account_id)
    OR
    check_is_account_admin(account_id)
    OR
    check_is_reseller_for(account_id)
  );

-- INSERT: Company owners, admins, or resellers can send invitations
CREATE POLICY "account_members_insert" ON public.account_members
  FOR INSERT
  WITH CHECK (
    -- Use helpers to check authority without RLS recursion
    check_is_company_owner(account_id)
    OR
    check_is_account_admin(account_id)
    OR
    check_is_reseller_for(account_id)
  );

-- UPDATE: Users can accept their own invitations, owners/admins/resellers can manage invitations
CREATE POLICY "account_members_update" ON public.account_members
  FOR UPDATE
  USING (
    -- Permission is based on my own record OR authority over the company
    user_id = auth.uid()
    OR
    email = auth.jwt()->>'email'
    OR
    check_is_company_owner(account_id)
    OR
    check_is_account_admin(account_id)
    OR
    check_is_reseller_for(account_id)
  )
  WITH CHECK (
    -- Users can only modify their own status/id, or managers can modify roles/etc
    user_id = auth.uid()
    OR
    email = auth.jwt()->>'email'
    OR
    check_is_company_owner(account_id)
    OR
    check_is_account_admin(account_id)
    OR
    check_is_reseller_for(account_id)
  );

-- DELETE: Owners can remove members
CREATE POLICY "account_members_delete" ON public.account_members
  FOR DELETE
  USING (
    check_is_company_owner(account_id)
    OR
    check_is_reseller_for(account_id)
  );

-- 5.1 Create policies for reseller tables
-- RESELLER INVITES: Resellers view what they sent, clients view what they received
CREATE POLICY "reseller_invites_select" ON public.reseller_invites
  FOR SELECT
  USING (
    -- I am the reseller owner (using helper to avoid recursion)
    check_is_company_owner(reseller_id)
    OR
    -- It was sent to my email
    invite_email = auth.jwt()->>'email'
  );

CREATE POLICY "reseller_invites_insert" ON public.reseller_invites
  FOR INSERT
  WITH CHECK (
    check_is_company_owner(reseller_id)
  );

CREATE POLICY "reseller_invites_update" ON public.reseller_invites
  FOR UPDATE
  USING (
    check_is_company_owner(reseller_id)
    OR
    invite_email = auth.jwt()->>'email'
  );

CREATE POLICY "reseller_invites_delete" ON public.reseller_invites
  FOR DELETE
  USING (
    check_is_company_owner(reseller_id)
  );

-- RESELLER CLIENTS (Linked portfolio)
CREATE POLICY "reseller_clients_select" ON public.reseller_clients
  FOR SELECT
  USING (
    check_is_company_owner(reseller_id)
    OR
    check_is_company_owner(client_company_id)
  );

CREATE POLICY "reseller_clients_insert" ON public.reseller_clients
  FOR INSERT
  WITH CHECK (
    check_is_company_owner(reseller_id)
  );

CREATE POLICY "reseller_clients_update" ON public.reseller_clients
  FOR UPDATE
  USING (
    check_is_company_owner(reseller_id)
  );

CREATE POLICY "reseller_clients_delete" ON public.reseller_clients
  FOR DELETE
  USING (
    check_is_company_owner(reseller_id)
  );

-- 5.2 Create policies for other dependent tables (Employees, Pay Runs, etc.)
-- This ensures that the "Cascade" drop doesn't leave these tables unprotected or broken.

-- EMPLOYEES
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON public.employees;
CREATE POLICY "employees_select" ON public.employees
  FOR SELECT USING (check_is_company_owner(company_id) OR check_is_accepted_member(company_id) OR check_is_reseller_for(company_id));

DROP POLICY IF EXISTS "employees_all_manage" ON public.employees;
CREATE POLICY "employees_all_manage" ON public.employees
  FOR ALL USING (check_is_company_owner(company_id) OR check_is_account_admin(company_id) OR check_is_reseller_for(company_id));

-- APP_USERS (Profile lookup)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_users_select" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users
  FOR SELECT USING (check_has_access_to_user_profile(id));

-- PAY_RUNS
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_runs_select" ON public.pay_runs;
CREATE POLICY "pay_runs_select" ON public.pay_runs
  FOR SELECT USING (check_is_company_owner(company_id) OR check_is_accepted_member(company_id) OR check_is_reseller_for(company_id));

DROP POLICY IF EXISTS "pay_runs_manage" ON public.pay_runs;
CREATE POLICY "pay_runs_manage" ON public.pay_runs
  FOR ALL USING (check_is_company_owner(company_id) OR check_is_account_admin(company_id) OR check_is_reseller_for(company_id));

-- PAY_RUN_LINE_ITEMS
ALTER TABLE public.pay_run_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_run_line_items_select" ON public.pay_run_line_items;
CREATE POLICY "pay_run_line_items_select" ON public.pay_run_line_items
  FOR SELECT USING (check_has_access_to_pay_run(pay_run_id));

-- 6. Verification - show all policies
SELECT
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('companies', 'account_members', 'reseller_invites', 'reseller_clients', 'employees', 'app_users', 'pay_runs')
ORDER BY tablename, policyname;
