-- Enforce the same overdue policy for subscriptions that already have a known
-- paid-through date but no DimePay schedule. This repairs records that were
-- left ACTIVE before the scheduled billing reconciliation was introduced.
--
-- Only subscriptions that are more than the standard seven-day grace period
-- overdue are touched. Gateway-managed subscriptions are excluded because a
-- signed DimePay webhook remains the authority for those payment outcomes.

WITH overdue AS (
  SELECT
    s.id,
    s.company_id,
    COALESCE(s.access_until, s.next_billing_date) AS paid_through
  FROM public.subscriptions AS s
  WHERE s.status = 'active'
    AND s.dime_subscription_id IS NULL
    AND s.dimepay_subscription_id IS NULL
    AND COALESCE(s.access_until, s.next_billing_date) < now() - interval '7 days'
)
UPDATE public.subscriptions AS s
SET
  status = 'expired',
  metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
    'access_expired_at', overdue.paid_through,
    'downgraded_for_nonpayment_at', now(),
    'downgrade_reason', 'payment_overdue',
    'grace_period_days', 7
  ),
  updated_at = now()
FROM overdue
WHERE s.id = overdue.id;

UPDATE public.companies AS c
SET
  plan = 'Free',
  status = 'ACTIVE',
  updated_at = now()
FROM public.subscriptions AS s
WHERE s.company_id = c.id
  AND s.status = 'expired'
  AND s.metadata ->> 'downgrade_reason' = 'payment_overdue'
  AND s.metadata ? 'downgraded_for_nonpayment_at';
