-- FIX INVITE SYSTEM COMPLETE
-- Addresses:
-- 1. "Unable to send invitation to existing account" (Lookup blocked by RLS)
-- 2. "Unable to cancel invite" (Missing DELETE policy)
-- 3. General permissions for Owner managing Members

-- 1. SECURE USER LOOKUP (Bypass RLS)
CREATE OR REPLACE FUNCTION get_user_id_by_email(email_input TEXT)
RETURNS UUID AS $$
DECLARE
    found_id UUID;
BEGIN
    SELECT id INTO found_id
    FROM public.app_users
    WHERE lower(email) = lower(email_input);
    RETURN found_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_user_id_by_email TO authenticated;


-- 2. FIX ACCOUNT MEMBERS POLICIES (Full CRUD)
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

-- CLEANUP OLD POLICIES
DROP POLICY IF EXISTS "account_members_select" ON public.account_members;
DROP POLICY IF EXISTS "account_members_insert" ON public.account_members;
DROP POLICY IF EXISTS "account_members_update" ON public.account_members;
DROP POLICY IF EXISTS "account_members_delete" ON public.account_members;

-- SELECT: Owners see members, Members see themselves
CREATE POLICY "account_members_select" ON public.account_members
FOR SELECT
USING (
   account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
   OR
   user_id = auth.uid()
);

-- INSERT: Owners can add members
CREATE POLICY "account_members_insert" ON public.account_members
FOR INSERT
WITH CHECK (
   account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);

-- UPDATE: Owners can update roles, Members can accept invites
CREATE POLICY "account_members_update" ON public.account_members
FOR UPDATE
USING (
   account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
   OR
   user_id = auth.uid()
);

-- DELETE: Owners can remove members (Cancel Invite)
CREATE POLICY "account_members_delete" ON public.account_members
FOR DELETE
USING (
   account_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
);
