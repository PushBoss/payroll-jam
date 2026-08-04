-- Crash detection: logs failures from both runtimes (Vercel api/* handlers and
-- the admin-handler edge function) so a silent outage like the July 21
-- missing-env-var incident surfaces immediately instead of going unnoticed
-- for weeks. See docs/superpowers/specs/2026-08-04-crash-detection-and-alerting-design.md

CREATE TABLE IF NOT EXISTS public.system_crash_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('vercel-api', 'supabase-edge')),
  endpoint text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'error')),
  error_message text NOT NULL,
  error_stack text,
  context jsonb,
  email_sent boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_system_crash_logs_created_at ON public.system_crash_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_crash_logs_severity ON public.system_crash_logs (severity, created_at DESC);
-- Supports the 30-minute email-dedupe lookup (same endpoint + error within a window).
CREATE INDEX IF NOT EXISTS idx_system_crash_logs_dedupe ON public.system_crash_logs (endpoint, error_message, created_at DESC);

ALTER TABLE public.system_crash_logs ENABLE ROW LEVEL SECURITY;

-- Writes happen only via the service-role client (both runtimes already use one
-- for everything else), so no INSERT policy for authenticated/anon roles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_crash_logs' AND policyname = 'super_admin_read_crash_logs'
  ) THEN
    CREATE POLICY super_admin_read_crash_logs ON public.system_crash_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.app_users u
          WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN'
        )
      );
  END IF;
END $$;
