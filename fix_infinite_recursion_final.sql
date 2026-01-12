-- FIX INFINITE RECURSION FINAL
-- The issue is that RLS policies on 'companies' query 'companies' again (checking reseller_id),
-- or 'reseller_invites' queries 'companies' which queries 'reseller_invites'...
-- We need to break the cycle by using SECURITY DEFINER functions for EVERYTHING.

-- 1. Helper: Get My Company ID (Already exists, but ensuring it's efficient)
CREATE OR REPLACE FUNCTION get_my_owned_company_id()
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper: Check if I am Reseller For a Company
CREATE OR REPLACE FUNCTION is_reseller_for_company(company_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_my_company_id UUID;
    v_is_reseller BOOLEAN;
BEGIN
    -- Get my company ID securely (bypassing RLS)
    v_my_company_id := get_my_owned_company_id();
    
    IF v_my_company_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if that company lists me as reseller
    SELECT EXISTS (
        SELECT 1 FROM public.reseller_clients 
        WHERE reseller_id = v_my_company_id 
        AND client_company_id = company_uuid
    ) INTO v_is_reseller;
    
    RETURN v_is_reseller;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. FIX COMPANIES (Recursive Loop Breaker)
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_read_all" ON public.companies;

CREATE POLICY "companies_select" ON public.companies
FOR SELECT
USING (
    -- Simple ownership check (Safe)
    owner_id = auth.uid()
    OR
    -- Check if I am a member (Safe, querying account_members)
    id IN (
        SELECT account_id FROM public.account_members 
        WHERE user_id = auth.uid() AND status = 'accepted'
    )
    OR
    -- Check if I am the reseller (Use Secure Function to assume role without triggering RLS)
    is_reseller_for_company(id)
);


-- 4. FIX RESELLER INVITES (Recursive Loop Breaker)
ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_delete" ON public.reseller_invites;

CREATE POLICY "reseller_invites_select"
ON public.reseller_invites FOR SELECT
USING (
    -- View invites I sent (as reseller owner) - Use Secure Function
    reseller_id = get_my_owned_company_id()
    OR
    -- View invites sent TO me (Safe)
    invite_email = (auth.jwt() ->> 'email')
);

CREATE POLICY "reseller_invites_insert"
ON public.reseller_invites FOR INSERT
WITH CHECK (
    reseller_id = get_my_owned_company_id()
);

CREATE POLICY "reseller_invites_update"
ON public.reseller_invites FOR UPDATE
USING (
    reseller_id = get_my_owned_company_id()
    OR
    invite_email = (auth.jwt() ->> 'email')
);

CREATE POLICY "reseller_invites_delete"
ON public.reseller_invites FOR DELETE
USING (
    reseller_id = get_my_owned_company_id()
);

-- 5. FIX RESELLER CLIENTS (Recursive Loop Breaker)
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reseller_clients_select" ON public.reseller_clients; -- Just in case

CREATE POLICY "reseller_clients_select"
ON public.reseller_clients FOR SELECT
USING (
    -- I can see links where I am the reseller
    reseller_id = get_my_owned_company_id()
    -- OR where I am the client (less common but valid)
    OR client_company_id = get_my_owned_company_id()
);

-- 6. Grant Permissions
GRANT EXECUTE ON FUNCTION get_my_owned_company_id TO authenticated;
GRANT EXECUTE ON FUNCTION is_reseller_for_company TO authenticated;
