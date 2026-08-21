-- Bring historic, already-approved weekly timesheets into the authoritative
-- daily-record lifecycle.  This is deliberately limited to APPROVED legacy
-- sheets: draft and submitted time must continue through normal admin review.
-- The source event key makes this safe to run repeatedly without duplicating
-- historical hours.

WITH legacy_entries AS (
  SELECT
    t.id AS legacy_timesheet_id,
    t.company_id,
    t.employee_id,
    t.updated_at AS approved_at,
    entry AS entry_data,
    e.pay_data,
    c.settings,
    rate.rate_type,
    rate.amount AS configured_rate,
    rate.currency AS configured_currency,
    rate.effective_from,
    rate.overtime_eligible,
    rate.weekly_overtime_threshold,
    rate.holiday_eligible,
    rate.holiday_multiplier
  FROM public.timesheets t
  JOIN public.employees e
    ON e.id = t.employee_id AND e.company_id = t.company_id
  JOIN public.companies c ON c.id = t.company_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.entries, '[]'::jsonb)) AS entry
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.employee_compensation_rates r
    WHERE r.company_id = t.company_id
      AND r.employee_id = t.employee_id
      AND r.effective_from <= (entry->>'date')::date
      AND (r.effective_to IS NULL OR r.effective_to >= (entry->>'date')::date)
    ORDER BY r.effective_from DESC
    LIMIT 1
  ) rate ON true
  WHERE upper(COALESCE(t.status, '')) = 'APPROVED'
    AND (entry->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    AND COALESCE((entry->>'totalHours')::numeric, 0) > 0
    -- Legacy eligibility comes from the existing JSON pay profile. The
    -- compensation rate table (when present) remains the preferred rate.
    AND upper(COALESCE(e.pay_data->>'payType', '')) IN ('TIMESHEET', 'HOURLY')
), inserted AS (
  INSERT INTO public.time_records (
    company_id,
    employee_id,
    work_date,
    start_at,
    end_at,
    break_minutes,
    worked_minutes,
    regular_minutes,
    overtime_minutes,
    holiday_minutes,
    source,
    approval_status,
    approved_at,
    source_event_id,
    legacy_timesheet_id,
    rate_snapshot
  )
  SELECT
    le.company_id,
    le.employee_id,
    (le.entry_data->>'date')::date,
    CASE WHEN (le.entry_data->>'startTime') ~ '^\d{2}:\d{2}$'
      THEN ((le.entry_data->>'date') || 'T' || (le.entry_data->>'startTime'))::timestamp AT TIME ZONE 'America/Jamaica'
      ELSE NULL END,
    CASE WHEN (le.entry_data->>'endTime') ~ '^\d{2}:\d{2}$'
      THEN ((le.entry_data->>'date') || 'T' || (le.entry_data->>'endTime'))::timestamp AT TIME ZONE 'America/Jamaica'
      ELSE NULL END,
    GREATEST(0, COALESCE((le.entry_data->>'breakDuration')::integer, 0)),
    ROUND((le.entry_data->>'totalHours')::numeric * 60)::integer,
    ROUND((le.entry_data->>'totalHours')::numeric * 60)::integer,
    0,
    0,
    'LEGACY_MIGRATION',
    'APPROVED',
    COALESCE(le.approved_at, now()),
    'legacy-timesheet:' || le.legacy_timesheet_id::text || ':' || COALESCE(le.entry_data->>'id', md5(le.entry_data::text)),
    le.legacy_timesheet_id,
    jsonb_build_object(
      'rateType', COALESCE(le.rate_type, 'HOURLY'),
      'amount', COALESCE(le.configured_rate, NULLIF(le.pay_data->>'hourlyRate', '')::numeric, 0),
      'currency', COALESCE(le.configured_currency, 'JMD'),
      'effectiveFrom', COALESCE(le.effective_from, (le.entry_data->>'date')::date),
      'overtimeEligible', COALESCE(le.overtime_eligible, true) AND COALESCE((le.settings->'timesheetOvertime'->>'enabled')::boolean, true),
      'overtimeMultiplier', GREATEST(1, COALESCE((le.settings->'timesheetOvertime'->>'multiplier')::numeric, 1.5)),
      'weeklyOvertimeThreshold', COALESCE(le.weekly_overtime_threshold, 40),
      'holidayEligible', COALESCE(le.holiday_eligible, false),
      'holidayMultiplier', COALESCE(le.holiday_multiplier, 2),
      'source', 'approved_legacy_timesheet_backfill'
    )
  FROM legacy_entries le
  WHERE COALESCE(le.configured_rate, NULLIF(le.pay_data->>'hourlyRate', '')::numeric, 0) > 0
  ON CONFLICT (company_id, source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING
  RETURNING *
)
INSERT INTO public.time_record_revisions (
  time_record_id,
  company_id,
  revision_number,
  event_type,
  before_value,
  after_value,
  actor_source,
  reason
)
SELECT
  id,
  company_id,
  0,
  'IMPORT',
  NULL,
  to_jsonb(inserted),
  'LEGACY_MIGRATION',
  'Backfilled from an already-approved legacy weekly timesheet.'
FROM inserted;
