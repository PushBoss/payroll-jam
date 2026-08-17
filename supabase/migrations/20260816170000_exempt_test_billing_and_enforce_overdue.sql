-- Rose's company is an intentionally retained product-test account. Flag it
-- explicitly so billing automation never relies on its display name or treats
-- it as a live customer.
UPDATE public.companies
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('isTestCompany', true),
    updated_at = now()
WHERE id = 'c2e5eebb-c8f6-4006-a123-012cd5490111';

UPDATE public.subscriptions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'billing_enforcement_exempt', true,
      'billing_enforcement_exempt_reason', 'test_account',
      'billing_enforcement_exempt_at', now()
    ),
    updated_at = now()
WHERE company_id = 'c2e5eebb-c8f6-4006-a123-012cd5490111';

-- Existing live subscriptions that are overdue beyond their grace period and
-- have no gateway schedule/card are immediately moved to Free. Unlike the
-- previous metadata-based repair, this query is driven only by the enforceable
-- billing fields and excludes explicit test accounts.
WITH overdue_live_subscriptions AS (
  SELECT s.id, s.company_id, COALESCE(s.access_until, s.next_billing_date) AS paid_through
  FROM public.subscriptions s
  JOIN public.companies c ON c.id = s.company_id
  WHERE s.status = 'active'
    AND s.dime_subscription_id IS NULL
    AND s.dimepay_subscription_id IS NULL
    AND s.dime_card_token IS NULL
    AND s.auto_renew = false
    AND COALESCE(s.access_until, s.next_billing_date) < now() - interval '7 days'
    AND COALESCE((c.settings ->> 'isTestCompany')::boolean, false) = false
)
UPDATE public.subscriptions s
SET status = 'expired',
    metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
      'access_expired_at', overdue_live_subscriptions.paid_through,
      'downgraded_for_nonpayment_at', now(),
      'downgrade_reason', 'payment_overdue',
      'grace_period_days', 7
    ),
    updated_at = now()
FROM overdue_live_subscriptions
WHERE s.id = overdue_live_subscriptions.id;

UPDATE public.companies c
SET plan = 'Free', status = 'ACTIVE', updated_at = now()
FROM public.subscriptions s
WHERE s.company_id = c.id
  AND s.status = 'expired'
  AND s.metadata ->> 'downgrade_reason' = 'payment_overdue'
  AND COALESCE((c.settings ->> 'isTestCompany')::boolean, false) = false;
