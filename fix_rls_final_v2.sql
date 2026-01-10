-- FIX RLS RECURSION AND VISIBILITY FINAL V2
-- High-reliability fix for infinite recursion and 406 errors.

-- 1. DROP ALL POTENTIALLY RECURSIVE POLICIES FIRST
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_read_all" ON public.companies;
DROP POLICY IF EXISTS "Allow public access to companies" ON public.companies;
DROP POLICY IF EXISTS "employees_select" ON public.employees;
DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_delete" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_clients_select" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_insert" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_update" ON public.reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_delete" ON public.reseller_clients;

-- 2. CREATE NON-RECURSIVE SECURITY DEFINER HELPERS
-- These functions bypass RLS entirely to get relationship data.

-- Get the company ID of the currently logged in user from app_users
CREATE OR REPLACE FUNCTION get_current_user_company_id()
RETURNS UUID AS $$
DECLARE
    v_company_id UUID;
BEGIN
    -- Try auth_user_id first (standard link)
    SELECT company_id INTO v_company_id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1;
    
    -- Fallback: Try id (some legacy records)
    IF v_company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM public.app_users WHERE id = auth.uid() LIMIT 1;
    END IF;

    RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if the current user is a reseller for a specific client company
CREATE OR REPLACE FUNCTION check_is_reseller_for(client_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_my_company_id UUID;
BEGIN
    -- Use the helper to get our ID safely
    v_my_company_id := get_current_user_company_id();
    
    IF v_my_company_id IS NULL THEN RETURN FALSE; END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.reseller_clients 
        WHERE reseller_id = v_my_company_id 
        AND client_company_id = client_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. APPLY CLEAN POLICIES

-- COMPANIES
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_select" ON public.companies
FOR SELECT USING (
    -- 1. I own it
    owner_id = auth.uid()
    OR
    -- 2. I am the company myself (current user's company)
    id = get_current_user_company_id()
    OR
    -- 3. I am a member (checked via account_members which has no companies dependency)
    id IN (SELECT account_id FROM public.account_members WHERE user_id = auth.uid())
    OR
    -- 4. I am the reseller for this company
    check_is_reseller_for(id)
);

-- EMPLOYEES
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_select" ON public.employees
FOR SELECT USING (
    -- I see employees in my company
    company_id = get_current_user_company_id()
    OR
    -- I am the reseller for this company
    check_is_reseller_for(company_id)
);

-- RESELLER INVITES
ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reseller_invites_select" ON public.reseller_invites
FOR SELECT USING (
    -- I sent it
    reseller_id = get_current_user_company_id()
    OR
    -- It was sent to me
    invite_email = (auth.jwt() ->> 'email')
);

CREATE POLICY "reseller_invites_insert" ON public.reseller_invites
FOR INSERT WITH CHECK (
    reseller_id = get_current_user_company_id()
);

-- RESELLER CLIENTS
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reseller_clients_select" ON public.reseller_clients
FOR SELECT USING (
    reseller_id = get_current_user_company_id()
    OR
    client_company_id = get_current_user_company_id()
);

-- 4. FINAL GRANTS
GRANT EXECUTE ON FUNCTION get_current_user_company_id TO authenticated;
GRANT EXECUTE ON FUNCTION check_is_reseller_for TO authenticated;
GRANT ALL ON public.reseller_invites TO authenticated;
GRANT ALL ON public.reseller_clients TO authenticated;
