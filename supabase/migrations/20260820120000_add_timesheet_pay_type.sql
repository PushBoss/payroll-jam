-- A Timesheet-paid employee derives pay from approved time records at pay-run
-- calculation time. Preserve the existing pay types and allow this explicit
-- configuration value in the canonical deployed schema.

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_pay_type_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_pay_type_check
  CHECK (
    pay_type IS NULL
    OR pay_type IN ('SALARIED', 'HOURLY', 'TIMESHEET', 'COMMISSION', 'PIECE_RATE')
  );
