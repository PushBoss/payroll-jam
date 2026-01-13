-- Comprehensive RLS policy fix - drop all conflicting policies and recreate clean ones

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

-- 2.1 Drop policies on reseller tables (ensure reseller flow is stable)
DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_clients_select" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_insert" ON public.reseller_clients;

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
    -- 1. My own invitation
    user_id = auth.uid()
    OR
    email = auth.jwt()->>'email'
    OR
    -- 2. I have authority over the account (Owner, Admin, or Reseller)
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid() OR reseller_id = auth.uid()
    )
    OR
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'accepted'
    )
  );

-- INSERT: Company owners, admins, or resellers can send invitations
CREATE POLICY "account_members_insert" ON public.account_members
  FOR INSERT
  WITH CHECK (
    -- 1. I own the company
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
    OR
    -- 2. I am an admin of the company
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'accepted'
    )
    OR
    -- 3. I am the reseller for the company
    account_id IN (
      SELECT id FROM public.companies WHERE reseller_id = auth.uid()
    )
  );

-- UPDATE: Users can accept their own invitations, owners/admins/resellers can manage invitations
CREATE POLICY "account_members_update" ON public.account_members
  FOR UPDATE
  USING (
    -- Authority checks
    user_id = auth.uid()
    OR
    email = auth.jwt()->>'email'
    OR
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid() OR reseller_id = auth.uid()
    )
    OR
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'accepted'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    email = auth.jwt()->>'email'
    OR
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid() OR reseller_id = auth.uid()
    )
    OR
    account_id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'accepted'
    )
  );

-- 5.1 Create policies for reseller tables
-- RESELLER INVITES: Resellers view what they sent, clients view what they received
CREATE POLICY "reseller_invites_select" ON public.reseller_invites
  FOR SELECT
  USING (
    reseller_id = (SELECT id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1)
    OR
    invite_email = auth.jwt()->>'email'
  );

CREATE POLICY "reseller_invites_insert" ON public.reseller_invites
  FOR INSERT
  WITH CHECK (
    reseller_id = (SELECT id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "reseller_invites_update" ON public.reseller_invites
  FOR UPDATE
  USING (
    reseller_id = (SELECT id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1)
    OR
    invite_email = auth.jwt()->>'email'
  );

-- RESELLER CLIENTS (Linked portfolio)
CREATE POLICY "reseller_clients_select" ON public.reseller_clients
  FOR SELECT
  USING (
    reseller_id = (SELECT id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1)
    OR
    client_company_id = (SELECT id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1)
  );

-- 6. Verification - show all policies
SELECT
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('companies', 'account_members', 'reseller_invites', 'reseller_clients')
ORDER BY tablename, policyname;
