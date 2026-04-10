-- Performance indexes for common Supabase REST and RLS access patterns.
-- These indexes target the exact hot-path filters used during app bootstrap.

CREATE INDEX IF NOT EXISTS idx_app_users_email ON public.app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_company_id ON public.app_users(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_company_id ON public.leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_runs_company_id_period_start ON public.pay_runs(company_id, period_start DESC);
