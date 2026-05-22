-- Fix employees.status constraint to match the frontend EmployeeStatus domain.
-- RLS/admin-handler cannot bypass CHECK constraints; this keeps CSV imports,
-- manual saves, and employee lifecycle actions on the same uppercase values.

BEGIN;

UPDATE public.employees
SET status = CASE
  WHEN status IS NULL OR btrim(status) = '' THEN 'ACTIVE'
  WHEN upper(replace(replace(btrim(status), '-', '_'), ' ', '_')) IN ('ACTIVE', 'ACT', 'CURRENT', 'YES', 'TRUE', 'EMPLOYED') THEN 'ACTIVE'
  WHEN upper(replace(replace(btrim(status), '-', '_'), ' ', '_')) IN ('ARCHIVED', 'ARCHIVE', 'INACTIVE') THEN 'ARCHIVED'
  WHEN upper(replace(replace(btrim(status), '-', '_'), ' ', '_')) IN ('PENDING', 'PENDING_ONBOARDING', 'ONBOARDING') THEN 'PENDING_ONBOARDING'
  WHEN upper(replace(replace(btrim(status), '-', '_'), ' ', '_')) IN ('PENDING_VERIFICATION', 'VERIFICATION') THEN 'PENDING_VERIFICATION'
  WHEN upper(replace(replace(btrim(status), '-', '_'), ' ', '_')) IN ('TERMINATED', 'TERMINATE', 'SEPARATED', 'FORMER', 'NO', 'FALSE') THEN 'TERMINATED'
  ELSE 'ACTIVE'
END;

ALTER TABLE public.employees
  ALTER COLUMN status SET DEFAULT 'ACTIVE';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_status_check
  CHECK (status IN ('ACTIVE', 'ARCHIVED', 'PENDING_ONBOARDING', 'PENDING_VERIFICATION', 'TERMINATED'));

COMMIT;
