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

-- 3. Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

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
-- SELECT: Users can see pending/accepted invitations sent to their email or for their companies
CREATE POLICY "account_members_select" ON public.account_members
  FOR SELECT
  USING (
    -- User can see their own invitations
    user_id = auth.uid()
    OR
    -- Company owner can see all invitations to their company
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

-- INSERT: Company owners can send invitations
CREATE POLICY "account_members_insert" ON public.account_members
  FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

-- UPDATE: Users can accept their own invitations, owners can manage invitations
CREATE POLICY "account_members_update" ON public.account_members
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    account_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

-- 6. Verification - show all policies
SELECT
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('companies', 'account_members')
ORDER BY tablename, policyname;
