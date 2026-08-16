-- Give recent legacy monthly subscriptions a concrete first due date only when
-- their subscription start is still a reliable record of the paid period. Do
-- not invent dates for older records or gateway schedules; those require a
-- DimePay reconciliation before they can be used for billing enforcement.

-- A manual payment/access grant is an explicit paid-through date, so it is safe
-- to use for the local subscription period regardless of the account age.
UPDATE public.subscriptions AS s
SET
  access_until = COALESCE(s.access_until, (c.settings -> 'billingGift' ->> 'giftedUntil')::timestamptz),
  next_billing_date = COALESCE(s.next_billing_date, (c.settings -> 'billingGift' ->> 'giftedUntil')::timestamptz),
  metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
    'billing_date_source', 'manual_access_backfill',
    'billing_date_backfilled_at', now()
  ),
  updated_at = now()
FROM public.companies AS c
WHERE c.id = s.company_id
  AND s.status = 'active'
  AND lower(COALESCE(s.billing_frequency, 'monthly')) = 'monthly'
  AND s.next_billing_date IS NULL
  AND s.access_until IS NULL
  AND COALESCE(c.settings -> 'billingGift' ->> 'giftedUntil', '') <> '';

-- For recent subscription rows (the normal one-month trial/initial period),
-- calculate the first renewal from the recorded subscription start. This
-- includes accounts such as Wayne Hayes and lets the normal card-required and
-- grace-period workflow begin. Rows older than 45 days remain untouched rather
-- than being assigned a fictional invoice date.
UPDATE public.subscriptions AS s
SET
  access_until = s.start_date + interval '1 month',
  next_billing_date = s.start_date + interval '1 month',
  metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
    'billing_date_source', 'recent_legacy_start_date_backfill',
    'billing_date_backfilled_at', now(),
    'card_required_by', s.start_date + interval '1 month'
  ),
  updated_at = now()
WHERE s.status = 'active'
  AND lower(COALESCE(s.billing_frequency, 'monthly')) = 'monthly'
  AND s.next_billing_date IS NULL
  AND s.access_until IS NULL
  AND s.dime_subscription_id IS NULL
  AND s.dimepay_subscription_id IS NULL
  AND s.start_date IS NOT NULL
  AND s.start_date >= now() - interval '45 days';
