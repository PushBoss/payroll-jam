-- FIX RESELLER PERMISSIONS FINAL
-- Addresses "permission denied for table users" and 406 company visibility errors.

-- 1. Fix RESELLER_INVITES Policy (The main culprit of 401 errors)
-- We remove the direct query to auth.users and use auth.jwt() ->> 'email' instead.
ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_delete" ON public.reseller_invites;

CREATE POLICY "reseller_invites_select"
ON public.reseller_invites FOR SELECT
USING (
  -- Reseller can see invites they sent
  reseller_id = get_current_user_company_id()
  OR
  -- Users can see invites sent to their email (Safe version)
  invite_email = (auth.jwt() ->> 'email')
  OR
  -- Direct Owner fallback
  reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

CREATE POLICY "reseller_invites_insert"
ON public.reseller_invites FOR INSERT
WITH CHECK (
  reseller_id = get_current_user_company_id()
  OR
  reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

CREATE POLICY "reseller_invites_update"
ON public.reseller_invites FOR UPDATE
USING (
   reseller_id = get_current_user_company_id()
   OR 
   invite_email = (auth.jwt() ->> 'email')
);

CREATE POLICY "reseller_invites_delete"
ON public.reseller_invites FOR DELETE
USING (
   reseller_id = get_current_user_company_id()
   OR
   reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

-- 2. Fix COMPANIES Policy (The culprit for 406 error - failing to see own company)
-- We ensure we look at reseller_clients table for relationships, rather than assuming columns exist.

DROP POLICY IF EXISTS "companies_select" ON public.companies;
-- Clean up any other broken policies
DROP POLICY IF EXISTS "companies_read_all" ON public.companies;
DROP POLICY IF EXISTS "Allow public access to companies" ON public.companies;

CREATE POLICY "companies_select" ON public.companies
  FOR SELECT
  USING (
    -- 1. Owner can see their company (Priority)
    owner_id = auth.uid()
    OR
    -- 2. Members can see their company
    id IN (
      SELECT account_id FROM public.account_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
    OR
    -- 3. Resellers can see their CLIENT companies (via reseller_clients table)
    id IN (
       SELECT client_company_id 
       FROM public.reseller_clients 
       WHERE reseller_id = get_current_user_company_id()
    )
    OR
    -- 4. Reseller Owner Fallback (via reseller_clients table)
    id IN (
       SELECT client_company_id 
       FROM public.reseller_clients 
       WHERE reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  );

-- 3. Confirm Grants (Just in case)
GRANT ALL ON public.reseller_invites TO authenticated;
GRANT ALL ON public.reseller_clients TO authenticated;
GRANT ALL ON public.companies TO authenticated;
