-- DimePay subscription lifecycle fields, intents, and webhook audit logs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS plan_name text DEFAULT 'Subscription',
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_frequency text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS amount numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'JMD',
  ADD COLUMN IF NOT EXISTS start_date timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS dime_customer_id text,
  ADD COLUMN IF NOT EXISTS dime_card_token text,
  ADD COLUMN IF NOT EXISTS dime_subscription_id text,
  ADD COLUMN IF NOT EXISTS card_last_four text,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS access_until timestamptz,
  ADD COLUMN IF NOT EXISTS dimepay_customer_id text,
  ADD COLUMN IF NOT EXISTS dimepay_subscription_id text,
  ADD COLUMN IF NOT EXISTS payment_method_last4 text,
  ADD COLUMN IF NOT EXISTS payment_method_brand text,
  ADD COLUMN IF NOT EXISTS next_billing_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

UPDATE public.subscriptions
SET
  status = CASE
    WHEN status IS NULL OR btrim(status) = '' THEN 'active'
    WHEN lower(btrim(status)) IN ('active', 'cancelled', 'canceled', 'expired', 'past_due', 'paused', 'pending', 'failed') THEN
      CASE WHEN lower(btrim(status)) = 'canceled' THEN 'cancelled' ELSE lower(btrim(status)) END
    WHEN upper(btrim(status)) = 'ACTIVE' THEN 'active'
    WHEN upper(btrim(status)) = 'PAST_DUE' THEN 'past_due'
    WHEN upper(btrim(status)) = 'SUSPENDED' THEN 'past_due'
    WHEN upper(btrim(status)) = 'PENDING_PAYMENT' THEN 'pending'
    ELSE 'active'
  END,
  plan_type = CASE
    WHEN plan_type IS NULL OR btrim(plan_type) = '' THEN
      CASE
        WHEN lower(btrim(COALESCE(plan_name, ''))) IN ('free', 'starter', 'professional', 'enterprise', 'reseller', 'pro') THEN lower(btrim(plan_name))
        ELSE 'subscription'
      END
    WHEN lower(btrim(plan_type)) IN ('free', 'starter', 'professional', 'enterprise', 'reseller', 'subscription', 'pro') THEN lower(btrim(plan_type))
    ELSE 'subscription'
  END,
  billing_frequency = CASE
    WHEN billing_frequency IS NULL OR btrim(billing_frequency) = '' THEN 'monthly'
    WHEN lower(btrim(billing_frequency)) IN ('monthly', 'yearly', 'annual') THEN lower(btrim(billing_frequency))
    ELSE 'monthly'
  END,
  amount = COALESCE(amount, 0),
  currency = COALESCE(NULLIF(btrim(currency), ''), 'JMD'),
  plan_name = COALESCE(NULLIF(btrim(plan_name), ''), 'Subscription'),
  start_date = COALESCE(start_date, now()),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  auto_renew = COALESCE(auto_renew, true),
  metadata = COALESCE(metadata, '{}'::jsonb);

UPDATE public.subscriptions
SET
  dime_customer_id = COALESCE(dime_customer_id, dimepay_customer_id),
  dime_subscription_id = COALESCE(dime_subscription_id, dimepay_subscription_id),
  dime_card_token = COALESCE(dime_card_token, metadata ->> 'dime_card_token'),
  card_last_four = COALESCE(card_last_four, payment_method_last4, metadata ->> 'card_last4'),
  card_brand = COALESCE(card_brand, payment_method_brand, metadata ->> 'card_brand'),
  access_until = COALESCE(access_until, next_billing_date, end_date);

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'paused', 'pending', 'failed'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN ('free', 'starter', 'professional', 'enterprise', 'reseller', 'subscription', 'pro'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_frequency_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_frequency_check
  CHECK (billing_frequency IN ('monthly', 'yearly', 'annual'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_dime_subscription_id
  ON public.subscriptions(dime_subscription_id)
  WHERE dime_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_dime_customer_id
  ON public.subscriptions(dime_customer_id)
  WHERE dime_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_access_until
  ON public.subscriptions(access_until)
  WHERE access_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dimepay_billing_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  flow text NOT NULL CHECK (flow IN ('signup', 'card_update', 'subscription_update')),
  user_id uuid,
  company_id uuid NOT NULL,
  local_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  dime_subscription_id text,
  dime_customer_id text,
  dime_card_token text,
  card_request_token text,
  plan_name text,
  plan_type text,
  amount numeric(10, 2),
  currency text NOT NULL DEFAULT 'JMD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dimepay_billing_intents_company
  ON public.dimepay_billing_intents(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dimepay_billing_intents_card_request_token
  ON public.dimepay_billing_intents(card_request_token)
  WHERE card_request_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dimepay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  event_id text UNIQUE,
  event_type text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verification text,
  payload jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dimepay_webhook_events_type_created
  ON public.dimepay_webhook_events(event_type, created_at DESC);

ALTER TABLE public.dimepay_billing_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dimepay_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_dimepay_billing_intents_updated_at ON public.dimepay_billing_intents;
CREATE TRIGGER update_dimepay_billing_intents_updated_at
  BEFORE UPDATE ON public.dimepay_billing_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
