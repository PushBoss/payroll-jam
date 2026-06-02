-- Preserve reseller invite billing context for plan preselection and resend links.

BEGIN;

ALTER TABLE public.reseller_invites
  ADD COLUMN IF NOT EXISTS plan_name text,
  ADD COLUMN IF NOT EXISTS estimated_employee_count integer,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

UPDATE public.reseller_invites
SET metadata = COALESCE(metadata, '{}'::jsonb);

COMMIT;
