-- Fix employees table RLS for company-admin CRUD operations.
-- This resolves 42501 insert failures when authenticated company users add employees.

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view company employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view own profile" ON public.employees;
DROP POLICY IF EXISTS "Company admins can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Company admins can update employees" ON public.employees;
DROP POLICY IF EXISTS "Company admins can delete employees" ON public.employees;
DROP POLICY IF EXISTS "Super admins can manage all employees" ON public.employees;

CREATE POLICY "Users can view company employees"
ON public.employees
FOR SELECT
USING (
  company_id IN (
    SELECT company_id
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
  )
);

CREATE POLICY "Employees can view own profile"
ON public.employees
FOR SELECT
USING (
  email = auth.jwt()->>'email'
);

CREATE POLICY "Company admins can insert employees"
ON public.employees
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
      AND company_id = employees.company_id
      AND role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
);

CREATE POLICY "Company admins can update employees"
ON public.employees
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
      AND company_id = employees.company_id
      AND role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
      AND company_id = employees.company_id
      AND role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
);

CREATE POLICY "Company admins can delete employees"
ON public.employees
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
      AND company_id = employees.company_id
      AND role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
);

CREATE POLICY "Super admins can manage all employees"
ON public.employees
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
      AND role = 'SUPER_ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE email = auth.jwt()->>'email'
      AND role = 'SUPER_ADMIN'
  )
);
