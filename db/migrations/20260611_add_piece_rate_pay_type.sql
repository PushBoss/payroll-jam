-- Allow piece-rate compensation in the legacy employees.pay_type column.
-- The app also persists detailed compensation fields in employees.pay_data.

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_pay_type_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_pay_type_check
  CHECK (
    pay_type IS NULL
    OR pay_type IN ('SALARIED', 'HOURLY', 'COMMISSION', 'PIECE_RATE')
  );
