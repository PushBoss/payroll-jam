-- Bootstrap/load-time performance indexes.
-- Run in Supabase SQL editor outside an explicit transaction.
-- These support the app's company-scoped startup reads and reseller RLS checks.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_company_id
  ON public.employees (company_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pay_runs_company_period_start
  ON public.pay_runs (company_id, period_start DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_requests_company_id
  ON public.leave_requests (company_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_users_company_id
  ON public.app_users (company_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reseller_clients_reseller_client_status
  ON public.reseller_clients (reseller_id, client_company_id, status);

ANALYZE public.employees;
ANALYZE public.pay_runs;
ANALYZE public.leave_requests;
ANALYZE public.app_users;
ANALYZE public.reseller_clients;
