-- Fix infinite recursion in companies_select policy
-- Drop the old recursive policy
DROP POLICY IF EXISTS "companies_select" ON public.companies;

-- Create new policy without recursion
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

-- Verify the fix
SELECT
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'companies' AND policyname = 'companies_select';
