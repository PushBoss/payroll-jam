-- Store accepted TAJ S01/S02 filing data separately from editable payroll runs.
-- Official filing layouts do not contain enough detail to safely recreate payslips.

CREATE TABLE IF NOT EXISTS public.compliance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('S01', 'S02')),
  reporting_period date NOT NULL,
  original_filename text NOT NULL,
  records jsonb NOT NULL DEFAULT '[]'::jsonb,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, report_type, reporting_period)
);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_company_period
  ON public.compliance_reports(company_id, reporting_period DESC);

ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can read compliance reports" ON public.compliance_reports;
CREATE POLICY "Company members can read compliance reports"
  ON public.compliance_reports FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.app_users WHERE id = auth.uid())
  );
