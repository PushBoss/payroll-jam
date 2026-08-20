-- Mirror of the canonical Supabase migration. The deployed migration lives in
-- supabase/migrations/20260820120000_add_timesheet_pay_type.sql.

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_pay_type_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_pay_type_check
  CHECK (
    pay_type IS NULL
    OR pay_type IN ('SALARIED', 'HOURLY', 'TIMESHEET', 'COMMISSION', 'PIECE_RATE')
  );
