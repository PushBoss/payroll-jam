-- Reconcile companies that already have a paid plan but predate subscription
-- persistence. A paid company must always have a local subscription row, even
-- when its original billing was handled outside the current DimePay flow.
--
-- This deliberately does not fabricate DimePay IDs, saved-card tokens,
-- payment events, access dates, or a recurring charge. Those fields can only
-- be populated from a signed DimePay webhook or a confirmed manual payment.
-- `auto_renew` stays false until that reconciliation happens.

WITH paid_companies AS (
  SELECT
    c.id AS company_id,
    c.created_at AS company_created_at,
    CASE lower(btrim(coalesce(c.plan, '')))
      WHEN 'starter' THEN 'Starter'
      WHEN 'pro' THEN 'Pro'
      WHEN 'professional' THEN 'Pro'
      WHEN 'enterprise' THEN 'Enterprise'
      WHEN 'reseller' THEN 'Reseller'
      ELSE btrim(c.plan)
    END AS plan_name,
    CASE lower(btrim(coalesce(c.plan, '')))
      WHEN 'starter' THEN 'starter'
      WHEN 'pro' THEN 'pro'
      WHEN 'professional' THEN 'pro'
      WHEN 'enterprise' THEN 'enterprise'
      WHEN 'reseller' THEN 'reseller'
      ELSE 'subscription'
    END AS plan_type,
    CASE upper(btrim(coalesce(c.status, 'ACTIVE')))
      WHEN 'CANCELLED' THEN 'cancelled'
      WHEN 'CANCELED' THEN 'cancelled'
      WHEN 'EXPIRED' THEN 'expired'
      WHEN 'PAST_DUE' THEN 'past_due'
      WHEN 'SUSPENDED' THEN 'past_due'
      WHEN 'PAUSED' THEN 'paused'
      WHEN 'PENDING' THEN 'pending'
      WHEN 'PENDING_PAYMENT' THEN 'pending'
      WHEN 'FAILED' THEN 'failed'
      ELSE 'active'
    END AS subscription_status,
    CASE upper(btrim(coalesce(c.billing_cycle, 'MONTHLY')))
      WHEN 'ANNUAL' THEN 'annual'
      WHEN 'YEARLY' THEN 'yearly'
      ELSE 'monthly'
    END AS billing_frequency
  FROM public.companies c
  WHERE lower(btrim(coalesce(c.plan, ''))) IN (
    'starter', 'pro', 'professional', 'enterprise', 'reseller'
  )
)
INSERT INTO public.subscriptions (
  company_id,
  plan_name,
  -- The deployed legacy table still requires its original price columns.
  -- A historical amount is unknown for an orphaned record, so preserve the
  -- existing table invariant with zero rather than fabricating a charge.
  base_price,
  plan_type,
  status,
  billing_frequency,
  amount,
  currency,
  start_date,
  auto_renew,
  metadata,
  created_at,
  updated_at
)
SELECT
  pc.company_id,
  pc.plan_name,
  0,
  pc.plan_type,
  pc.subscription_status,
  pc.billing_frequency,
  0,
  'JMD',
  coalesce(pc.company_created_at, now()),
  false,
  jsonb_build_object(
    'source', 'legacy_paid_plan_backfill',
    'gateway_reconciliation_required', true,
    'backfilled_at', now()
  ),
  now(),
  now()
FROM paid_companies pc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subscriptions s
  WHERE s.company_id = pc.company_id
);
