-- Multi-card payment methods vault: up to 5 saved cards per company, one marked primary.
-- subscriptions.dime_card_token/card_last_four/card_brand remain the source of truth for
-- api/cron/dimepay-billing.ts and are kept in sync with whichever row here is primary.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dime_card_token text NOT NULL,
  card_request_token text,
  card_last4 text,
  card_brand text,
  card_expiry_month int,
  card_expiry_year int,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one primary card per company.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_one_primary
  ON public.payment_methods(company_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_payment_methods_company
  ON public.payment_methods(company_id, created_at DESC);

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's payment methods"
  ON public.payment_methods FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM app_users
      WHERE email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Super admins can view all payment methods"
  ON public.payment_methods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role = 'SUPER_ADMIN'
    )
  );

-- Inserts/updates/deletes go through service_role (Vercel API routes), matching
-- the write pattern already used for subscriptions/payment_history.

COMMIT;
