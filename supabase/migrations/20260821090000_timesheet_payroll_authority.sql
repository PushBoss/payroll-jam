-- Phase 2: authoritative time records for Timesheet-Based Payroll.
-- Existing weekly `timesheets` remain readable as legacy display data. New
-- payroll eligibility, approvals, audit history and locks use these tables.

CREATE TABLE IF NOT EXISTS public.time_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  start_at timestamptz,
  end_at timestamptz,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  worked_minutes integer NOT NULL CHECK (worked_minutes > 0),
  regular_minutes integer NOT NULL DEFAULT 0 CHECK (regular_minutes >= 0),
  overtime_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  holiday_minutes integer NOT NULL DEFAULT 0 CHECK (holiday_minutes >= 0),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('EMPLOYEE','ADMIN','CSV','API','QR','MANUAL','LEGACY_MIGRATION')),
  approval_status text NOT NULL DEFAULT 'LOGGED' CHECK (approval_status IN ('LOGGED','APPROVED','REJECTED','INCLUDED_IN_PAYROLL','LOCKED')),
  rate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  holiday_code text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  pay_run_id uuid,
  pay_run_line_item_id text,
  locked_at timestamptz,
  locked_by uuid,
  source_event_id text,
  idempotency_key text,
  legacy_timesheet_id uuid,
  adjustment_of_id uuid REFERENCES public.time_records(id) ON DELETE RESTRICT,
  adjustment_direction integer NOT NULL DEFAULT 1 CHECK (adjustment_direction IN (-1, 1)),
  revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (regular_minutes + overtime_minutes + holiday_minutes <= worked_minutes)
);

CREATE TABLE IF NOT EXISTS public.time_record_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_record_id uuid NOT NULL REFERENCES public.time_records(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CREATE','EDIT','APPROVE','REJECT','PAYROLL_ASSOCIATE','UNLOCK_DRAFT','FINALIZE','IMPORT','ADJUSTMENT')),
  before_value jsonb,
  after_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_user_id uuid,
  actor_role text,
  actor_source text,
  reason text,
  pay_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (time_record_id, revision_number)
);

CREATE TABLE IF NOT EXISTS public.pay_run_time_records (
  pay_run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  time_record_id uuid NOT NULL REFERENCES public.time_records(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  calculation_snapshot jsonb NOT NULL,
  released_at timestamptz,
  released_by uuid,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pay_run_id, time_record_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_run_time_records_active_record
  ON public.pay_run_time_records(time_record_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_records_company_employee_date
  ON public.time_records(company_id, employee_id, work_date, approval_status);
CREATE INDEX IF NOT EXISTS idx_time_records_pay_run ON public.time_records(company_id, pay_run_id);
CREATE INDEX IF NOT EXISTS idx_time_records_adjustment ON public.time_records(adjustment_of_id) WHERE adjustment_of_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_records_source_event
  ON public.time_records(company_id, source, source_event_id) WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.employee_compensation_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  rate_type text NOT NULL CHECK (rate_type IN ('HOURLY','DAILY','PIECE')),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'JMD',
  effective_from date NOT NULL,
  effective_to date,
  overtime_eligible boolean NOT NULL DEFAULT true,
  weekly_overtime_threshold numeric NOT NULL DEFAULT 40 CHECK (weekly_overtime_threshold >= 0),
  holiday_eligible boolean NOT NULL DEFAULT false,
  holiday_multiplier numeric NOT NULL DEFAULT 2 CHECK (holiday_multiplier >= 1),
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 2 CHECK (multiplier >= 1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, holiday_date, name)
);

CREATE TABLE IF NOT EXISTS public.timesheet_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  checksum text,
  uploader_id uuid,
  mapping_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW','COMMITTED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.timesheet_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.timesheet_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_row jsonb NOT NULL,
  result text NOT NULL CHECK (result IN ('ACCEPTED','DUPLICATE','INVALID','MISSING_EMPLOYEE','EXCEPTION','COMMITTED')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  time_record_id uuid REFERENCES public.time_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id, row_number)
);

ALTER TABLE public.pay_runs ADD COLUMN IF NOT EXISTS payroll_mode text NOT NULL DEFAULT 'REGULAR'
  CHECK (payroll_mode IN ('REGULAR','TIMESHEET'));

CREATE OR REPLACE FUNCTION public.enforce_time_record_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.approval_status IN ('INCLUDED_IN_PAYROLL', 'LOCKED')
    AND current_setting('app.timesheet_lock_override', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Time records included in payroll or locked by a finalized pay run cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_time_record_lock ON public.time_records;
CREATE TRIGGER trg_enforce_time_record_lock
  BEFORE UPDATE ON public.time_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_time_record_lock();

CREATE OR REPLACE FUNCTION public.create_timesheet_pay_run(
  p_company_id uuid,
  p_pay_run jsonb,
  p_record_ids uuid[],
  p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay_run_id uuid := (p_pay_run->>'id')::uuid;
  v_count integer;
  v_period_start date := (p_pay_run->>'period_start')::date;
  v_period_end date := (p_pay_run->>'period_end')::date;
BEGIN
  IF v_pay_run_id IS NULL OR cardinality(p_record_ids) = 0 OR v_period_start IS NULL OR v_period_end IS NULL OR v_period_start > v_period_end THEN
    RAISE EXCEPTION 'A pay run and approved time records are required';
  END IF;
  IF cardinality(p_record_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_record_ids) AS id) THEN
    RAISE EXCEPTION 'Time records must be unique';
  END IF;

  -- Lock the candidate records for the duration of this transaction. Every
  -- check and state change below rolls back together if any condition fails.
  PERFORM id FROM public.time_records
    WHERE company_id = p_company_id AND id = ANY(p_record_ids)
    FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(p_record_ids) THEN
    RAISE EXCEPTION 'One or more time records do not belong to this company';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.time_records
    WHERE id = ANY(p_record_ids)
      AND (approval_status <> 'APPROVED' OR work_date < v_period_start OR work_date > v_period_end)
  ) THEN
    RAISE EXCEPTION 'One or more time records are not approved and within the selected pay period';
  END IF;

  -- Resolve overtime at payroll-selection time by employee/week, never by a
  -- browser's per-entry calculation. Approved holiday minutes retain their
  -- separate, higher-precedence component. A disabled overtime policy keeps
  -- all non-holiday minutes regular.
  WITH ordered AS (
    SELECT tr.id,
      greatest(0, tr.worked_minutes - tr.holiday_minutes) AS non_holiday_minutes,
      coalesce((tr.rate_snapshot->>'overtimeEligible')::boolean, true) AS overtime_eligible,
      greatest(0, coalesce((tr.rate_snapshot->>'weeklyOvertimeThreshold')::numeric, 40) * 60) AS threshold_minutes,
      coalesce(sum(greatest(0, tr.worked_minutes - tr.holiday_minutes)) OVER (
        PARTITION BY tr.employee_id, date_trunc('week', tr.work_date)
        ORDER BY tr.work_date, tr.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS prior_week_minutes
    FROM public.time_records tr WHERE tr.id = ANY(p_record_ids)
  ), allocated AS (
    SELECT id,
      CASE WHEN overtime_eligible THEN greatest(0, least(non_holiday_minutes, threshold_minutes - prior_week_minutes)) ELSE non_holiday_minutes END AS regular_minutes,
      CASE WHEN overtime_eligible THEN greatest(0, non_holiday_minutes - greatest(0, least(non_holiday_minutes, threshold_minutes - prior_week_minutes))) ELSE 0 END AS overtime_minutes
    FROM ordered
  )
  UPDATE public.time_records tr SET regular_minutes = allocated.regular_minutes, overtime_minutes = allocated.overtime_minutes, updated_at = now()
  FROM allocated WHERE tr.id = allocated.id;

  INSERT INTO public.pay_runs (id, company_id, period_start, period_end, pay_date, pay_frequency, status, total_gross, total_net, employee_count, line_items, payroll_mode)
  VALUES (
    v_pay_run_id, p_company_id,
    (p_pay_run->>'period_start')::date, (p_pay_run->>'period_end')::date,
    (p_pay_run->>'pay_date')::date, coalesce(p_pay_run->>'pay_frequency', 'MONTHLY'),
    coalesce(p_pay_run->>'status', 'DRAFT'), coalesce((p_pay_run->>'total_gross')::numeric, 0),
    coalesce((p_pay_run->>'total_net')::numeric, 0), coalesce((p_pay_run->>'employee_count')::integer, 0),
    coalesce(p_pay_run->'line_items', '[]'::jsonb), 'TIMESHEET'
  );

  INSERT INTO public.pay_run_time_records (pay_run_id, time_record_id, employee_id, company_id, calculation_snapshot)
  SELECT v_pay_run_id, id, employee_id, p_company_id,
    jsonb_build_object('workedMinutes', worked_minutes, 'regularMinutes', regular_minutes, 'overtimeMinutes', overtime_minutes, 'holidayMinutes', holiday_minutes, 'rateSnapshot', rate_snapshot)
  FROM public.time_records WHERE id = ANY(p_record_ids);

  UPDATE public.time_records
  SET approval_status = 'INCLUDED_IN_PAYROLL', pay_run_id = v_pay_run_id,
      locked_at = now(), locked_by = p_actor_id, updated_at = now()
  WHERE id = ANY(p_record_ids);

  INSERT INTO public.time_record_revisions (time_record_id, company_id, revision_number, event_type, before_value, after_value, actor_user_id, actor_source, pay_run_id)
  SELECT id, company_id, revision_count + 1, 'PAYROLL_ASSOCIATE',
    jsonb_build_object('approvalStatus', 'APPROVED'),
    jsonb_build_object('approvalStatus', 'INCLUDED_IN_PAYROLL', 'payRunId', v_pay_run_id),
    p_actor_id, 'SERVER', v_pay_run_id
  FROM public.time_records WHERE id = ANY(p_record_ids);
  UPDATE public.time_records SET revision_count = revision_count + 1 WHERE id = ANY(p_record_ids);
  RETURN v_pay_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_timesheet_pay_run_draft(p_company_id uuid, p_pay_run_id uuid, p_actor_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.timesheet_lock_override', 'on', true);
  IF EXISTS (SELECT 1 FROM public.pay_runs WHERE id = p_pay_run_id AND company_id = p_company_id AND status = 'FINALIZED') THEN
    RAISE EXCEPTION 'A finalized pay run cannot release time records';
  END IF;
  UPDATE public.pay_run_time_records SET released_at = now(), released_by = p_actor_id, release_reason = p_reason
    WHERE pay_run_id = p_pay_run_id AND company_id = p_company_id AND released_at IS NULL;
  INSERT INTO public.time_record_revisions (time_record_id, company_id, revision_number, event_type, before_value, after_value, actor_user_id, actor_source, reason, pay_run_id)
  SELECT id, company_id, revision_count + 1, 'UNLOCK_DRAFT',
    jsonb_build_object('approvalStatus', approval_status, 'payRunId', pay_run_id),
    jsonb_build_object('approvalStatus', 'APPROVED', 'payRunId', null),
    p_actor_id, 'SERVER', p_reason, p_pay_run_id
  FROM public.time_records WHERE company_id = p_company_id AND pay_run_id = p_pay_run_id AND approval_status = 'INCLUDED_IN_PAYROLL';
  UPDATE public.time_records SET approval_status = 'APPROVED', pay_run_id = NULL, locked_at = NULL, locked_by = NULL, revision_count = revision_count + 1, updated_at = now()
    WHERE company_id = p_company_id AND pay_run_id = p_pay_run_id AND approval_status = 'INCLUDED_IN_PAYROLL';
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_timesheet_pay_run(p_company_id uuid, p_pay_run_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.timesheet_lock_override', 'on', true);
  UPDATE public.pay_runs SET status = 'FINALIZED' WHERE id = p_pay_run_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pay run not found'; END IF;
  INSERT INTO public.time_record_revisions (time_record_id, company_id, revision_number, event_type, before_value, after_value, actor_user_id, actor_source, pay_run_id)
  SELECT id, company_id, revision_count + 1, 'FINALIZE',
    jsonb_build_object('approvalStatus', approval_status, 'payRunId', pay_run_id),
    jsonb_build_object('approvalStatus', 'LOCKED', 'payRunId', pay_run_id),
    p_actor_id, 'SERVER', p_pay_run_id
  FROM public.time_records WHERE company_id = p_company_id AND pay_run_id = p_pay_run_id AND approval_status = 'INCLUDED_IN_PAYROLL';
  UPDATE public.time_records SET approval_status = 'LOCKED', locked_at = now(), locked_by = p_actor_id, revision_count = revision_count + 1, updated_at = now()
    WHERE company_id = p_company_id AND pay_run_id = p_pay_run_id AND approval_status = 'INCLUDED_IN_PAYROLL';
END;
$$;
