-- Per-company activation funnel classification (furthest reached stage), for drill-down
-- lists. Sibling to get_activation_funnel (which stays untouched) - same EXISTS checks,
-- returning one row per company instead of aggregate counts.

CREATE OR REPLACE FUNCTION public.get_activation_funnel_companies(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(company_id uuid, stage text, stage_order int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(start_date, date_trunc('month', now()) - interval '11 months');
  v_end timestamptz := COALESCE(end_date, now());
BEGIN
  RETURN QUERY
  WITH cohort AS (
    SELECT id, owner_id FROM public.companies
    WHERE created_at >= v_start AND created_at <= v_end
  ),
  classified AS (
    SELECT
      c.id,
      EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.is_onboarded = true AND u.role IN ('OWNER', 'ADMIN', 'RESELLER')
          AND (u.company_id = c.id OR u.id = c.owner_id OR u.auth_user_id = c.owner_id)
      ) AS is_onboarded,
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.company_id = c.id AND COALESCE(e.status, 'ACTIVE') NOT IN ('ARCHIVED', 'TERMINATED')
      ) AS has_team,
      EXISTS (
        SELECT 1 FROM public.pay_runs pr
        WHERE pr.company_id = c.id AND pr.status = 'FINALIZED'
      ) AS ran_payroll
    FROM cohort c
  )
  SELECT
    id,
    CASE
      WHEN ran_payroll THEN 'Ran Payroll'
      WHEN has_team THEN 'Added Team'
      WHEN is_onboarded THEN 'Onboarded'
      ELSE 'Signed Up'
    END,
    CASE
      WHEN ran_payroll THEN 4
      WHEN has_team THEN 3
      WHEN is_onboarded THEN 2
      ELSE 1
    END
  FROM classified;
END;
$$;

REVOKE ALL ON FUNCTION public.get_activation_funnel_companies(timestamptz, timestamptz) FROM PUBLIC;
