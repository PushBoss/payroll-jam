-- SQL migration to update RLS policies on the employees table to support resellers.
-- This allows users with the role 'RESELLER' in app_users to manage employees
-- of companies where the company's reseller_id matches the reseller's company_id.

-- Drop the existing policies so we can recreate them
DROP POLICY IF EXISTS "Users can view company employees" ON public.employees;
DROP POLICY IF EXISTS "Company admins can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Company admins can update employees" ON public.employees;
DROP POLICY IF EXISTS "Company admins can delete employees" ON public.employees;

-- 1. SELECT policy: allow users of the same company, and resellers whose company manages the employee's company
CREATE POLICY "Users can view company employees"
ON public.employees
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    LEFT JOIN public.companies c ON c.id = employees.company_id
    WHERE u.email = auth.jwt()->>'email'
      AND (
        u.company_id = employees.company_id
        OR (u.role = 'RESELLER' AND c.reseller_id = u.company_id)
      )
  )
);

-- 2. INSERT policy: allow company admins and resellers
CREATE POLICY "Company admins can insert employees"
ON public.employees
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    LEFT JOIN public.companies c ON c.id = employees.company_id
    WHERE u.email = auth.jwt()->>'email'
      AND (
        u.company_id = employees.company_id
        OR (u.role = 'RESELLER' AND c.reseller_id = u.company_id)
      )
      AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
);

-- 3. UPDATE policy: allow company admins and resellers
CREATE POLICY "Company admins can update employees"
ON public.employees
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    LEFT JOIN public.companies c ON c.id = employees.company_id
    WHERE u.email = auth.jwt()->>'email'
      AND (
        u.company_id = employees.company_id
        OR (u.role = 'RESELLER' AND c.reseller_id = u.company_id)
      )
      AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    LEFT JOIN public.companies c ON c.id = employees.company_id
    WHERE u.email = auth.jwt()->>'email'
      AND (
        u.company_id = employees.company_id
        OR (u.role = 'RESELLER' AND c.reseller_id = u.company_id)
      )
      AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
);

-- 4. DELETE policy: allow company admins and resellers
CREATE POLICY "Company admins can delete employees"
ON public.employees
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    LEFT JOIN public.companies c ON c.id = employees.company_id
    WHERE u.email = auth.jwt()->>'email'
      AND (
        u.company_id = employees.company_id
        OR (u.role = 'RESELLER' AND c.reseller_id = u.company_id)
      )
      AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
);
