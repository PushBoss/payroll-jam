-- Bulk update employee deduction balances after payroll finalization.
-- Keeps payrun finalization to one authorized write request instead of one
-- edge-function invocation per employee.

CREATE OR REPLACE FUNCTION public.bulk_update_employee_deductions(
  p_company_id uuid,
  p_updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_count integer;
  v_updated_count integer;
BEGIN
  IF jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_updates must be a JSON array';
  END IF;

  WITH input_rows AS (
    SELECT DISTINCT ON ((item ->> 'id')::uuid)
      (item ->> 'id')::uuid AS employee_id,
      COALESCE(item -> 'customDeductions', '[]'::jsonb) AS custom_deductions
    FROM jsonb_array_elements(p_updates) AS item
    WHERE item ? 'id'
    ORDER BY (item ->> 'id')::uuid
  )
  SELECT COUNT(*) INTO v_expected_count
  FROM input_rows;

  WITH input_rows AS (
    SELECT DISTINCT ON ((item ->> 'id')::uuid)
      (item ->> 'id')::uuid AS employee_id,
      COALESCE(item -> 'customDeductions', '[]'::jsonb) AS custom_deductions
    FROM jsonb_array_elements(p_updates) AS item
    WHERE item ? 'id'
    ORDER BY (item ->> 'id')::uuid
  ),
  updated AS (
    UPDATE public.employees e
    SET
      custom_deductions = input_rows.custom_deductions,
      deductions = input_rows.custom_deductions
    FROM input_rows
    WHERE e.id = input_rows.employee_id
      AND e.company_id = p_company_id
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_updated_count
  FROM updated;

  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION 'One or more employees do not belong to company %', p_company_id;
  END IF;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_employee_deductions(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_employee_deductions(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_employee_deductions(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_payroll_ytd_summary(
  p_company_id uuid,
  p_year integer
)
RETURNS TABLE (
  employee_id text,
  ytd_gross numeric,
  ytd_nis numeric,
  ytd_tax_paid numeric,
  ytd_pension numeric,
  ytd_statutory_income numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH line_items AS (
    SELECT
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
    COALESCE(SUM(n.gross_pay + n.taxable_additions - n.nis - n.pension), 0) AS ytd_statutory_income
  FROM normalized n
  GROUP BY n.employee_id;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_ytd_summary(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payroll_ytd_summary(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_ytd_summary(uuid, integer) TO service_role;
