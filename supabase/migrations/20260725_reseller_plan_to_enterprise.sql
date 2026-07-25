-- Reseller role / plan decoupling — production data changes
-- Spec: docs/superpowers/specs/2026-07-24-reseller-role-plan-decoupling-design.md
--
-- RUN ORDER MATTERS. Step 1 must complete before Step 2, otherwise any company
-- moved to the Enterprise plan would fall back to Free in useSubscription
-- (the catalog is loaded from global_config.pricingPlans, not from code).
--
-- Step 1 also fixes a pre-existing latent bug: companies already on the
-- "Enterprise" plan (e.g. andriw@dirtyhanddesigns.com) currently fall back to
-- the Free plan because no Enterprise entry exists in the catalog.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add the Enterprise plan to the live catalog (global_config.pricingPlans)
-- Carries the reseller economics (base 3000 + 500/user + 20% commission),
-- limit 'Unlimited' (exact string, required by the useSubscription limit parser),
-- and reseller/partner features. Idempotent: only appends if not already present.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.global_config
SET config = jsonb_set(
  config,
  '{pricingPlans}',
  (config->'pricingPlans') || jsonb_build_object(
    'id', 'p5',
    'name', 'Enterprise',
    'priceConfig', jsonb_build_object(
      'type', 'base', 'monthly', 0, 'annual', 0,
      'baseFee', 3000, 'perUserFee', 500, 'resellerCommission', 20
    ),
    'description', 'Dedicated workspace for Accountants & Payroll Bureaus.',
    'limit', 'Unlimited',
    'features', jsonb_build_array(
      'White Label Branding', 'Multi-Client Portfolio', '20% Revenue Commission',
      'Compliance Dashboard', 'Dedicated Partner Support'
    ),
    'cta', 'Become a Partner',
    'highlight', false,
    'color', 'bg-gray-100',
    'textColor', 'text-gray-900',
    'isActive', true
  ),
  true
)
WHERE id = 'platform'
  AND NOT (config->'pricingPlans' @> '[{"name":"Enterprise"}]');

-- Verify Step 1 before continuing:
--   select jsonb_path_query_array(config->'pricingPlans', '$[*].name') from global_config where id='platform';
--   -- expect: ["Free","Starter","Pro","Reseller","Enterprise"]

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Migrate the one company still on the legacy "Reseller" plan value
-- onto Enterprise. Role stays RESELLER (unchanged). Only run AFTER Step 1.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.companies
SET plan = 'Enterprise'
WHERE plan = 'Reseller';

-- Verify Step 2:
--   select plan, count(*) from companies group by plan order by count(*) desc;
--   -- expect: no rows with plan = 'Reseller'

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- Step 2: UPDATE public.companies SET plan = 'Reseller' WHERE id = '<company_id>';
--         (rosealia19's company id: f012... — capture the exact id before running,
--          or re-derive: select id, name from companies where plan='Enterprise';)
-- Step 1: UPDATE public.global_config
--         SET config = jsonb_set(config, '{pricingPlans}',
--           (select jsonb_agg(p) from jsonb_array_elements(config->'pricingPlans') p
--            where p->>'name' <> 'Enterprise'))
--         WHERE id = 'platform';
--   NOTE: rolling back Step 1 will re-break andriw (Enterprise → Free fallback),
--   so only roll back Step 1 if also reverting the code change.
