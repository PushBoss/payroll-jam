-- Version 1.0.4: Activation funnel analytics

CREATE OR REPLACE FUNCTION public.get_activation_funnel(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(start_date, date_trunc('month', now()) - interval '11 months');
  v_end timestamptz := COALESCE(end_date, now());
  v_registered integer := 0;
  v_onboarded integer := 0;
  v_added_team integer := 0;
  v_ran_payroll integer := 0;
BEGIN
  WITH cohort AS (
    SELECT id, owner_id
    FROM public.companies
    WHERE created_at >= v_start
      AND created_at <= v_end
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM cohort) AS registered,
      (
        SELECT COUNT(*)
        FROM cohort c
        WHERE EXISTS (
          SELECT 1
          FROM public.app_users u
          WHERE u.is_onboarded = true
            AND u.role IN ('OWNER', 'ADMIN', 'RESELLER')
            AND (u.company_id = c.id OR u.id = c.owner_id OR u.auth_user_id = c.owner_id)
        )
      ) AS onboarded,
      (
        SELECT COUNT(*)
        FROM cohort c
        WHERE EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.company_id = c.id
            AND COALESCE(e.status, 'ACTIVE') NOT IN ('ARCHIVED', 'TERMINATED')
        )
      ) AS added_team,
      (
        SELECT COUNT(*)
        FROM cohort c
        WHERE EXISTS (
          SELECT 1
          FROM public.pay_runs pr
          WHERE pr.company_id = c.id
            AND pr.status = 'FINALIZED'
        )
      ) AS ran_payroll
  )
  SELECT registered, onboarded, added_team, ran_payroll
  INTO v_registered, v_onboarded, v_added_team, v_ran_payroll
  FROM counts;

  RETURN jsonb_build_array(
    jsonb_build_object(
      'step', '1. Signed Up',
      'count', v_registered,
      'rate', 100
    ),
    jsonb_build_object(
      'step', '2. Onboarded',
      'count', v_onboarded,
      'rate', CASE WHEN v_registered > 0 THEN round((v_onboarded::numeric / v_registered::numeric) * 100, 1) ELSE 0 END
    ),
    jsonb_build_object(
      'step', '3. Added Team',
      'count', v_added_team,
      'rate', CASE WHEN v_registered > 0 THEN round((v_added_team::numeric / v_registered::numeric) * 100, 1) ELSE 0 END
    ),
    jsonb_build_object(
      'step', '4. Ran Payroll',
      'count', v_ran_payroll,
      'rate', CASE WHEN v_registered > 0 THEN round((v_ran_payroll::numeric / v_registered::numeric) * 100, 1) ELSE 0 END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_activation_funnel(timestamptz, timestamptz) FROM PUBLIC;
