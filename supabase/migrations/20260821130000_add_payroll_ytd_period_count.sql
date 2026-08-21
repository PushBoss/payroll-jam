-- The cumulative-PAYE client receives the YTD totals from this function. It
-- must also receive the number of finalized pay periods represented by those
-- totals; otherwise several prior periods can be annualized as though they
-- occurred in one period, producing an excessive PAYE deduction.

DROP FUNCTION IF EXISTS public.get_payroll_ytd_summary(uuid, integer);

CREATE FUNCTION public.get_payroll_ytd_summary(
  p_company_id uuid,
  p_year integer
)
RETURNS TABLE (
  employee_id text,
  ytd_gross numeric,
  ytd_nis numeric,
  ytd_tax_paid numeric,
  ytd_pension numeric,
  ytd_statutory_income numeric,
  ytd_periods integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH line_items AS (
    SELECT
      pr.id AS pay_run_id,
      line_item ->> 'employeeId' AS employee_id,
      line_item
    FROM public.pay_runs pr
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pr.line_items, '[]'::jsonb)) AS line_item
    WHERE pr.company_id = p_company_id
      AND pr.status = 'FINALIZED'
      AND pr.period_start >= make_date(p_year, 1, 1)
      AND pr.period_start < make_date(p_year + 1, 1, 1)
  ),
  normalized AS (
    SELECT
      li.pay_run_id,
      li.employee_id,
      COALESCE(NULLIF(li.line_item ->> 'grossPay', '')::numeric, 0) AS gross_pay,
      CASE
        WHEN jsonb_typeof(li.line_item -> 'additionsBreakdown') = 'array'
          AND jsonb_array_length(li.line_item -> 'additionsBreakdown') > 0
        THEN COALESCE((
          SELECT SUM(COALESCE(NULLIF(addition ->> 'amount', '')::numeric, 0))
          FROM jsonb_array_elements(li.line_item -> 'additionsBreakdown') AS addition
          WHERE COALESCE((addition ->> 'isTaxable')::boolean, true) = true
        ), 0)
        ELSE COALESCE(NULLIF(li.line_item ->> 'additions', '')::numeric, 0)
      END AS taxable_additions,
      COALESCE(NULLIF(li.line_item ->> 'nis', '')::numeric, 0) AS nis,
      COALESCE(NULLIF(li.line_item ->> 'paye', '')::numeric, 0) AS paye,
      COALESCE(NULLIF(li.line_item ->> 'pension', '')::numeric, 0) AS pension
    FROM line_items li
    WHERE li.employee_id IS NOT NULL
      AND li.employee_id <> ''
  )
  SELECT
    n.employee_id,
    COALESCE(SUM(n.gross_pay + n.taxable_additions), 0) AS ytd_gross,
    COALESCE(SUM(n.nis), 0) AS ytd_nis,
    COALESCE(SUM(n.paye), 0) AS ytd_tax_paid,
    COALESCE(SUM(n.pension), 0) AS ytd_pension,
    COALESCE(SUM(n.gross_pay + n.taxable_additions - n.nis - n.pension), 0) AS ytd_statutory_income,
    COUNT(DISTINCT n.pay_run_id)::integer AS ytd_periods
  FROM normalized n
  GROUP BY n.employee_id;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_ytd_summary(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payroll_ytd_summary(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_ytd_summary(uuid, integer) TO service_role;
