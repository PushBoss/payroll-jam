-- 2026-04-23
-- Add first-class columns to companies that save-company already references.
-- Previously these values were buried in settings JSONB; runtime code in
-- admin-handler/save-company was performing upserts against columns that did
-- not exist, causing silent schema-mismatch errors.

BEGIN;

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS email        TEXT,
    ADD COLUMN IF NOT EXISTS phone        TEXT,
    ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN IF NOT EXISTS employee_limit INTEGER;

-- Backfill from existing JSONB settings so data is not lost
UPDATE public.companies
SET email = settings->>'email'
WHERE email IS NULL AND (settings->>'email') IS NOT NULL AND (settings->>'email') != '';

UPDATE public.companies
SET phone = settings->>'phone'
WHERE phone IS NULL AND (settings->>'phone') IS NOT NULL AND (settings->>'phone') != '';

-- Indexes for common lookups used by the admin panel
CREATE INDEX IF NOT EXISTS idx_companies_email         ON public.companies(email);
CREATE INDEX IF NOT EXISTS idx_companies_billing_cycle ON public.companies(billing_cycle);

-- Batched employee-count RPC used by get-all-companies in admin-handler.
-- Replaces 2N per-company COUNT queries with a single GROUP BY query.
CREATE OR REPLACE FUNCTION public.get_company_employee_counts(company_ids UUID[])
RETURNS TABLE(company_id UUID, employee_count BIGINT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT company_id, COUNT(*) AS employee_count
    FROM employees
    WHERE company_id = ANY(company_ids)
    GROUP BY company_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_employee_counts(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_company_employee_counts(UUID[]) TO authenticated;

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.get_company_employee_counts(UUID[]);
-- DROP INDEX IF EXISTS idx_companies_billing_cycle;
-- DROP INDEX IF EXISTS idx_companies_email;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS employee_limit;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS billing_cycle;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS phone;
-- ALTER TABLE public.companies DROP COLUMN IF EXISTS email;
