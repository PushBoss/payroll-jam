-- Fix Reseller Visibility and RLS Policies

-- 1. Create a helper function to get current user's company ID securely
-- This avoids infinite recursion in RLS policies by bypassing RLS on app_users
CREATE OR REPLACE FUNCTION get_current_user_company_id()
RETURNS UUID AS $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT company_id INTO v_company_id
    FROM public.app_users
    WHERE auth_user_id = auth.uid() -- Assuming auth_user_id is the link to auth.users
    LIMIT 1;
    
    -- Fallback: If not found by auth_user_id, try id (in case they are mixed)
    IF v_company_id IS NULL THEN
        SELECT company_id INTO v_company_id
        FROM public.app_users
        WHERE id = auth.uid()
        LIMIT 1;
    END IF;

    RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix COMPANIES RLS policy
-- Allow resellers to see their client companies
DROP POLICY IF EXISTS "companies_select" ON public.companies;
-- Drop other potential conflicting policies
DROP POLICY IF EXISTS "companies_read_all" ON public.companies;
DROP POLICY IF EXISTS "Allow public access to companies" ON public.companies;

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
    -- We compare the company's reseller_id (which is a Company ID) with the current user's Company ID
    reseller_id = get_current_user_company_id() 
    OR
    -- Fallback: Reseller ID matches a company owned by current user (Direct Owner check)
    reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );


-- 3. Fix RESELLER_CLIENTS RLS policy
-- Allow resellers to see their portfolio
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow resellers to view their clients" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_select" ON public.reseller_clients;

CREATE POLICY "reseller_clients_select" 
ON public.reseller_clients FOR SELECT 
USING (
  -- The reseller_id in the row matches the current user's company ID
  reseller_id = get_current_user_company_id()
  OR
  -- The client_company_id matches the current user's company ID (Client viewing their own link)
  client_company_id = get_current_user_company_id()
  OR
  -- Fallback: The reseller_id matches a company owned by the user (if app_users is empty/broken)
  reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

-- 4. Fix RESELLER_INVITES RLS policy
ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;

CREATE POLICY "reseller_invites_select"
ON public.reseller_invites FOR SELECT
USING (
  -- Reseller can see invites they sent
  reseller_id = get_current_user_company_id()
  OR
  -- Users can see invites sent to their email
  invite_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  OR
  -- Fallback for Reseller Owner
  reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

CREATE POLICY "reseller_invites_insert"
ON public.reseller_invites FOR INSERT
WITH CHECK (
  -- Reseller can insert invites
  reseller_id = get_current_user_company_id()
  OR
  reseller_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

CREATE POLICY "reseller_invites_update"
ON public.reseller_invites FOR UPDATE
USING (
   -- Reseller can update
   reseller_id = get_current_user_company_id()
   OR 
   -- Invitee can update (e.g. to set status = ACCEPTED)
   invite_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- 4. Verify/Fix App Users RLS to ensure get_current_user_company_id works? 
-- Since the function is SECURITY DEFINER, it bypasses RLS, so app_users RLS doesn't block it.

-- 5. Helper to verify what's happening (Optional Run)
-- SELECT get_current_user_company_id();
