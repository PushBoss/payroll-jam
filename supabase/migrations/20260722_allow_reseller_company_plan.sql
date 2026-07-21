-- The application persists the frontend plan label `Reseller`, but older
-- databases reject it through companies_plan_check. Accept all canonical plan
-- spellings used by the application while retaining validation.

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_plan_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_plan_check
  CHECK (
    plan IS NULL
    OR lower(btrim(plan)) IN ('free', 'starter', 'pro', 'professional', 'enterprise', 'reseller')
  );
