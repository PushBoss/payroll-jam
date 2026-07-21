-- Ensure the QR attendance feature's runtime tables are deployed through the
-- canonical Supabase migration directory. Earlier definitions lived only under
-- db/migrations, which can leave deployed environments without these tables.

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

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS employee_name text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS clock_in_at timestamptz;

CREATE TABLE IF NOT EXISTS public.attendance_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.company_locations(id) ON DELETE CASCADE,
  pass_code_hash text NOT NULL,
  code_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  employee_id text,
  user_id uuid,
  method text NOT NULL CHECK (method IN ('QR', 'PASS_CODE')),
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  reason text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id text NOT NULL,
  employee_name text NOT NULL,
  location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  location_name text,
  user_id uuid,
  method text NOT NULL CHECK (method IN ('QR', 'PASS_CODE')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  clock_in_at timestamptz NOT NULL,
  clock_out_at timestamptz,
  total_hours numeric NOT NULL DEFAULT 0,
  timesheet_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_badges_active_location
  ON public.attendance_badges(company_id, location_id) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_shifts_one_open
  ON public.attendance_shifts(company_id, employee_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_company_locations_company_id
  ON public.company_locations(company_id) WHERE is_active = true;
