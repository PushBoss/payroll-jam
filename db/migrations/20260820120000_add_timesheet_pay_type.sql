-- Mirror of the canonical Supabase migration. The deployed migration lives in
-- supabase/migrations/20260820120000_add_timesheet_pay_type.sql.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'pay_type'
  ) THEN
    ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_pay_type_check;
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_pay_type_check
      CHECK (pay_type IS NULL OR pay_type IN ('SALARIED', 'HOURLY', 'TIMESHEET', 'COMMISSION', 'PIECE_RATE'));
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'pay_data'
  ) THEN
    ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_pay_data_pay_type_check;
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_pay_data_pay_type_check
      CHECK (
        pay_data IS NULL
        OR pay_data->>'payType' IS NULL
        OR pay_data->>'payType' IN ('SALARIED', 'HOURLY', 'TIMESHEET', 'COMMISSION', 'PIECE_RATE')
      );
  END IF;
END $$;
