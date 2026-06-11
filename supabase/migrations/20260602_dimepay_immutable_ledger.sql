-- Append-only DimePay ledger for audit-safe payment state derivation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dimepay_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimepay_reference_id text NOT NULL,
  company_id uuid,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  dime_subscription_id text,
  event_id text,
  event_type text NOT NULL,
  state text NOT NULL CHECK (
    state IN (
      'initiated',
      'authorized',
      'captured',
      'failed',
      'refunded',
      'card_bound',
      'subscription_created',
      'subscription_cancelled',
      'subscription_paused'
    )
  ),
  amount numeric(10, 2),
  currency text NOT NULL DEFAULT 'JMD',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dimepay_ledger_event_id
  ON public.dimepay_ledger(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dimepay_ledger_reference_created
  ON public.dimepay_ledger(dimepay_reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dimepay_ledger_company_created
  ON public.dimepay_ledger(company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_dimepay_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'dimepay_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_dimepay_ledger_update ON public.dimepay_ledger;
CREATE TRIGGER prevent_dimepay_ledger_update
  BEFORE UPDATE ON public.dimepay_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dimepay_ledger_mutation();

DROP TRIGGER IF EXISTS prevent_dimepay_ledger_delete ON public.dimepay_ledger;
CREATE TRIGGER prevent_dimepay_ledger_delete
  BEFORE DELETE ON public.dimepay_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dimepay_ledger_mutation();

ALTER TABLE public.dimepay_ledger ENABLE ROW LEVEL SECURITY;

COMMIT;
