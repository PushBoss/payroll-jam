-- FIX RECURSION LOOP V3 (CRITICAL)
-- Breaks the infinite loop between 'account_members' and 'companies' tables.

-- 1. Helper to safely check ownership (Bypassing RLS)
-- This allows checking if you own a company WITHOUT triggering the company's RLS policies
CREATE OR REPLACE FUNCTION check_is_company_owner(company_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.companies 
        WHERE id = company_uuid 
        AND owner_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION check_is_company_owner TO authenticated;

-- 2. Update account_members Policies to use the helper
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_members_select" ON public.account_members;
CREATE POLICY "account_members_select" ON public.account_members
FOR SELECT
USING (
   -- Owner seeing members (uses Secure Helper to avoid Companies RLS loop)
   check_is_company_owner(account_id)
   OR
   -- Member seeing self
   user_id = auth.uid()
);

DROP POLICY IF EXISTS "account_members_insert" ON public.account_members;
CREATE POLICY "account_members_insert" ON public.account_members
FOR INSERT
WITH CHECK (
   check_is_company_owner(account_id)
);

DROP POLICY IF EXISTS "account_members_update" ON public.account_members;
CREATE POLICY "account_members_update" ON public.account_members
FOR UPDATE
USING (
   check_is_company_owner(account_id)
   OR
   user_id = auth.uid()
);

DROP POLICY IF EXISTS "account_members_delete" ON public.account_members;
CREATE POLICY "account_members_delete" ON public.account_members
FOR DELETE
USING (
   check_is_company_owner(account_id)
);
