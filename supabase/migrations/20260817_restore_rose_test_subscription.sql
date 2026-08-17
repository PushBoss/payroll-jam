-- Restore the explicitly exempt Rose test account after the initial overdue
-- repair migration. Test accounts do not represent billable customer access.
UPDATE public.companies
SET plan = 'Enterprise',
    status = 'ACTIVE',
    settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('isTestCompany', true),
    updated_at = now()
WHERE id = 'c2e5eebb-c8f6-4006-a123-012cd5490111';

UPDATE public.subscriptions
SET plan_name = 'Enterprise',
    plan_type = 'enterprise',
    status = 'active',
    auto_renew = false,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'billing_enforcement_exempt', true,
      'billing_enforcement_exempt_reason', 'test_account',
      'billing_enforcement_exempt_at', now(),
      'test_account_restored_at', now()
    ),
    updated_at = now()
WHERE company_id = 'c2e5eebb-c8f6-4006-a123-012cd5490111';
