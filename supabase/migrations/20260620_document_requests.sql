-- Version 1.0.4: Employee document request tracking

CREATE TABLE IF NOT EXISTS public.document_requests (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  generated_content TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_requests_status_check'
  ) THEN
    ALTER TABLE public.document_requests
      ADD CONSTRAINT document_requests_status_check
      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'GENERATED', 'DELIVERED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_requests_company_id
  ON public.document_requests(company_id);

CREATE INDEX IF NOT EXISTS idx_document_requests_employee_id
  ON public.document_requests(employee_id);

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_requests_company_members_select" ON public.document_requests;
CREATE POLICY "document_requests_company_members_select"
  ON public.document_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = document_requests.company_id
    )
  );

DROP POLICY IF EXISTS "document_requests_company_members_insert" ON public.document_requests;
CREATE POLICY "document_requests_company_members_insert"
  ON public.document_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = document_requests.company_id
    )
  );

DROP POLICY IF EXISTS "document_requests_admin_update" ON public.document_requests;
CREATE POLICY "document_requests_admin_update"
  ON public.document_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = document_requests.company_id
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = document_requests.company_id
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN')
    )
  );

CREATE OR REPLACE FUNCTION public.set_document_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_requests_updated_at ON public.document_requests;
CREATE TRIGGER trg_document_requests_updated_at
  BEFORE UPDATE ON public.document_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_document_requests_updated_at();
