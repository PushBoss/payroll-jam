-- Fix: Add INSERT and UPDATE policies for companies table
-- These policies allow authenticated users to create and update companies they own

-- 1. Add INSERT policy for companies (allow authenticated users to create companies)
CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT
  WITH CHECK (
    -- User must be authenticated and own the company
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

-- 2. Add UPDATE policy for companies (allow owners to update their companies)
CREATE POLICY "companies_update" ON public.companies
  FOR UPDATE
  USING (
    -- Owner can update their company
    owner_id = auth.uid()
  )
  WITH CHECK (
    -- Owner stays the same
    owner_id = auth.uid()
  );

-- 3. Verify RLS is enabled on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 4. Verification query - show all policies on companies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'companies'
ORDER BY policyname;
