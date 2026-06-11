-- Branch locations and QR attendance metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geofence_radius_meters integer NOT NULL DEFAULT 100 CHECK (geofence_radius_meters > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_locations_company_id
  ON public.company_locations(company_id)
  WHERE is_active = true;

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('MANUAL', 'AUTO_QR')),
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS clock_in_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_timesheets_source_company
  ON public.timesheets(company_id, source);

CREATE INDEX IF NOT EXISTS idx_timesheets_location_id
  ON public.timesheets(location_id)
  WHERE location_id IS NOT NULL;

ALTER TABLE public.company_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company admins manage locations" ON public.company_locations;
CREATE POLICY "Company admins manage locations" ON public.company_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = company_locations.company_id
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = company_locations.company_id
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER')
    )
  );

DROP POLICY IF EXISTS "Company employees read active locations" ON public.company_locations;
CREATE POLICY "Company employees read active locations" ON public.company_locations
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = company_locations.company_id
    )
  );

COMMIT;
