-- The authoritative payroll transaction is the sole allowed writer of
-- Included/Locked time records.  It must set the same transaction-local
-- override already used by draft-release and finalization before allocating
-- regular/overtime minutes and associating the selected records.

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
  PERFORM set_config('app.timesheet_lock_override', 'on', true);

  IF v_pay_run_id IS NULL OR cardinality(p_record_ids) = 0 OR v_period_start IS NULL OR v_period_end IS NULL OR v_period_start > v_period_end THEN
    RAISE EXCEPTION 'A pay run and approved time records are required';
  END IF;
  IF cardinality(p_record_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_record_ids) AS id) THEN
    RAISE EXCEPTION 'Time records must be unique';
  END IF;

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
