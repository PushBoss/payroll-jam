-- ==========================================
-- COMPREHENSIVE RLS FIX (CORRECTED)
-- Based on Database RLS Action Plan Audit
--
-- PREREQUISITES — read before running:
--
--   1. Migration 011 (global_config read access) strips DimePay keys from the
--      global_config JSONB. Verify no keys remain BEFORE running this script:
--        SELECT config FROM public.global_config LIMIT 1;
--      Confirm the output shows no apiKey / secretKey fields before proceeding.
--
--   2. Migration 014 (plan_type constraint) replaces 'professional'/'enterprise'
--      with 'pro'/'reseller'/'subscription' to match planService.ts.
--      Verify what values are currently stored BEFORE running:
--        SELECT DISTINCT plan_type FROM public.subscriptions;
--      If any rows have 'professional' or 'enterprise', UPDATE them first.
--
--   3. The "Public read invite by token" policy on reseller_invites is REMOVED.
--      Any code calling supabase.from('reseller_invites').select(...) for token
--      lookups must be updated to call supabase.rpc('get_reseller_invite_by_token',
--      { invite_token: token }) instead.
--
-- ==========================================


BEGIN;


-- ==========================================
-- Migration 001 — Foundation: Auth Helper Functions
--
-- CHANGES vs original:
--   - Added SET search_path = '' to all SECURITY DEFINER functions (prevents
--     search_path injection attacks where a malicious schema shadows app_users)
--   - Rewrote can_access_company() as a single query — original called
--     app_users 3× per row (once in is_super_admin, twice via auth_user_company_id)
--   - Added REVOKE/GRANT to restrict helper functions to authenticated role only
-- ==========================================


CREATE OR REPLACE FUNCTION public.auth_user_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT company_id::UUID FROM public.app_users WHERE id = auth.uid()
$$;


CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT role FROM public.app_users WHERE id = auth.uid()
$$;


CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.app_users WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
$$;


-- Single-query rewrite: original called app_users 3× per invocation.
-- Now: 1 scan of app_users + conditional scan of reseller_clients.
CREATE OR REPLACE FUNCTION public.can_access_company(target_company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'SUPER_ADMIN'
        OR u.company_id = target_company_id
        OR EXISTS (
          SELECT 1 FROM public.reseller_clients rc
          WHERE rc.reseller_id = u.company_id
            AND rc.client_company_id = target_company_id
            AND rc.status = 'ACTIVE'
        )
      )
  )
$$;


-- Restrict helpers to authenticated role — anon should never call these
REVOKE EXECUTE ON FUNCTION public.auth_user_company_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_company(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_company(UUID) TO authenticated;




-- ==========================================
-- Migration 002 — app_users RLS
-- ==========================================


ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Users read own profile" ON public.app_users;
CREATE POLICY "Users read own profile" ON public.app_users
  FOR SELECT USING (id = auth.uid());


DROP POLICY IF EXISTS "Admins read company users" ON public.app_users;
CREATE POLICY "Admins read company users" ON public.app_users
  FOR SELECT USING (
    company_id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER')
  );


DROP POLICY IF EXISTS "Super admin reads all users" ON public.app_users;
CREATE POLICY "Super admin reads all users" ON public.app_users
  FOR SELECT USING (public.is_super_admin());


DROP POLICY IF EXISTS "Users update own profile" ON public.app_users;
CREATE POLICY "Users update own profile" ON public.app_users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


DROP POLICY IF EXISTS "Super admin full access" ON public.app_users;
CREATE POLICY "Super admin full access" ON public.app_users
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




-- ==========================================
-- Migration 003 — companies RLS
-- ==========================================


ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Members read own company" ON public.companies;
CREATE POLICY "Members read own company" ON public.companies
  FOR SELECT USING (public.can_access_company(id));


DROP POLICY IF EXISTS "Owners and admins update company" ON public.companies;
CREATE POLICY "Owners and admins update company" ON public.companies
  FOR UPDATE
  USING (
    id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN')
  )
  WITH CHECK (
    id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN')
  );


DROP POLICY IF EXISTS "Super admin full access" ON public.companies;
CREATE POLICY "Super admin full access" ON public.companies
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




-- ==========================================
-- Migration 004 — employees RLS
--
-- NOTE: "Employee reads own record" uses email matching here (temporary).
-- Migration 013b below replaces it with auth_user_id = auth.uid() after
-- the auth_user_id column is added and backfilled by Migration 013.
-- ==========================================


ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Admins manage company employees" ON public.employees;
CREATE POLICY "Admins manage company employees" ON public.employees
  FOR ALL
  USING (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
  WITH CHECK (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  );


DROP POLICY IF EXISTS "Employee reads own record" ON public.employees;
CREATE POLICY "Employee reads own record" ON public.employees
  FOR SELECT USING (
    public.auth_user_role() = 'EMPLOYEE'
    AND email = (SELECT email FROM public.app_users WHERE id = auth.uid())
    AND company_id = public.auth_user_company_id()
  );




-- ==========================================
-- Migration 005 — pay_runs RLS
-- ==========================================


ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Admins manage pay runs" ON public.pay_runs;
CREATE POLICY "Admins manage pay runs" ON public.pay_runs
  FOR ALL
  USING (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
  WITH CHECK (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  );




-- ==========================================
-- Migration 006 — pay_run_snapshots RLS
--
-- CHANGE: Employee read policy removed entirely.
-- pay_run_snapshots has no employee_id column — it is a company-level JSONB
-- blob (pay_run_id + company_id + snapshot_data). There is no safe way to
-- scope it to a single employee at the RLS layer without a dedicated column.
-- Employee payslip access should be served via pay_run_line_items (if it
-- exists) or via an edge function that extracts only their line items from
-- snapshot_data JSONB.
-- ==========================================


ALTER TABLE public.pay_run_snapshots ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Admins access pay run snapshots" ON public.pay_run_snapshots;
CREATE POLICY "Admins access pay run snapshots" ON public.pay_run_snapshots
  FOR ALL
  USING (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
  WITH CHECK (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  );


-- Explicitly drop the old over-permissive employee policy if it exists
DROP POLICY IF EXISTS "Employee reads own company snapshots" ON public.pay_run_snapshots;
DROP POLICY IF EXISTS "Employee reads own pay snapshots" ON public.pay_run_snapshots;




-- ==========================================
-- Migration 007 — account_members RLS
-- ==========================================


ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Users read own memberships" ON public.account_members;
CREATE POLICY "Users read own memberships" ON public.account_members
  FOR SELECT USING (user_id = auth.uid());


DROP POLICY IF EXISTS "Admins manage account members" ON public.account_members;
CREATE POLICY "Admins manage account members" ON public.account_members
  FOR ALL
  USING (
    account_id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'RESELLER')
  )
  WITH CHECK (
    account_id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'RESELLER')
  );


DROP POLICY IF EXISTS "Super admin full access" ON public.account_members;
CREATE POLICY "Super admin full access" ON public.account_members
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




-- ==========================================
-- Migration 008 — audit_logs, leave_requests, timesheets RLS
--
-- CHANGES vs original:
--   - leave_requests + timesheets: WITH CHECK now validates employee_id
--     ownership (original only checked company_id, allowing an employee to
--     insert a record under a colleague's employee_id)
--   - Email-based employee_id lookup is a stopgap; Migration 013b upgrades
--     these to use auth_user_id = auth.uid() after the backfill
-- ==========================================


ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Admins read company audit logs" ON public.audit_logs;
CREATE POLICY "Admins read company audit logs" ON public.audit_logs
  FOR SELECT USING (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN')
  );
-- Frontend also writes audit logs directly in supabaseService.ts and inviteService.ts,
-- so we need an INSERT policy that validates the actor is the current user.
DROP POLICY IF EXISTS "Users insert own audit logs" ON public.audit_logs;
CREATE POLICY "Users insert own audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (
    public.can_access_company(company_id)
    AND actor_id::TEXT = auth.uid()::TEXT
  );




ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Admins manage leave requests" ON public.leave_requests;
CREATE POLICY "Admins manage leave requests" ON public.leave_requests
  FOR ALL
  USING (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
  WITH CHECK (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  );


DROP POLICY IF EXISTS "Employee manages own leave requests" ON public.leave_requests;
CREATE POLICY "Employee manages own leave requests" ON public.leave_requests
  FOR ALL
  USING (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (SELECT email FROM public.app_users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (SELECT email FROM public.app_users WHERE id = auth.uid())
    )
  );




ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Admins manage timesheets" ON public.timesheets;
CREATE POLICY "Admins manage timesheets" ON public.timesheets
  FOR ALL
  USING (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  )
  WITH CHECK (
    public.can_access_company(company_id)
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER', 'SUPER_ADMIN')
  );


DROP POLICY IF EXISTS "Employee manages own timesheets" ON public.timesheets;
CREATE POLICY "Employee manages own timesheets" ON public.timesheets
  FOR ALL
  USING (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (SELECT email FROM public.app_users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE email = (SELECT email FROM public.app_users WHERE id = auth.uid())
    )
  );




-- ==========================================
-- Migration 009 — reseller_clients and reseller_invites RLS
--
-- CHANGES vs original:
--   - "Public read invite by token" policy REMOVED — it exposed all invite
--     tokens to every authenticated user, completely bypassing token security
--   - Replaced with get_reseller_invite_by_token() SECURITY DEFINER function:
--     call supabase.rpc('get_reseller_invite_by_token', { invite_token: token })
--     Granted to both anon and authenticated (needed for pre-auth onboarding flow)
-- ==========================================


ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Resellers manage own clients" ON public.reseller_clients;
CREATE POLICY "Resellers manage own clients" ON public.reseller_clients
  FOR ALL
  USING (
    reseller_id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'RESELLER')
  )
  WITH CHECK (
    reseller_id = public.auth_user_company_id()
    AND public.auth_user_role() IN ('OWNER', 'ADMIN', 'RESELLER')
  );


DROP POLICY IF EXISTS "Super admin full access" ON public.reseller_clients;
CREATE POLICY "Super admin full access" ON public.reseller_clients
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Resellers manage own invites" ON public.reseller_invites;
CREATE POLICY "Resellers manage own invites" ON public.reseller_invites
  FOR ALL
  USING (reseller_id = public.auth_user_company_id())
  WITH CHECK (reseller_id = public.auth_user_company_id());


-- Remove the over-permissive public read — replaced by the RPC function below
DROP POLICY IF EXISTS "Public read invite by token" ON public.reseller_invites;


DROP POLICY IF EXISTS "Super admin full access" ON public.reseller_invites;
CREATE POLICY "Super admin full access" ON public.reseller_invites
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());


-- Token lookup RPC — replaces direct table read for invite onboarding flow
-- Granted to anon so unauthenticated users clicking invite links can resolve the token
CREATE OR REPLACE FUNCTION public.get_reseller_invite_by_token(p_invite_token TEXT)
RETURNS SETOF public.reseller_invites
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT * FROM public.reseller_invites WHERE invite_token = p_invite_token LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_reseller_invite_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reseller_invite_by_token(TEXT) TO authenticated, anon;




-- ==========================================
-- Migration 010 — Fix subscriptions and payment_history (Email → auth.uid())
-- ==========================================


DROP POLICY IF EXISTS "Users can view their company's subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can update subscriptions" ON public.subscriptions;


DROP POLICY IF EXISTS "Company members view subscription" ON public.subscriptions;
CREATE POLICY "Company members view subscription" ON public.subscriptions
  FOR SELECT USING (public.can_access_company(company_id));


DROP POLICY IF EXISTS "Super admin full access" ON public.subscriptions;
CREATE POLICY "Super admin full access" ON public.subscriptions
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




DROP POLICY IF EXISTS "Users can view their company's payment history" ON public.payment_history;
DROP POLICY IF EXISTS "Super admins can view all payment history" ON public.payment_history;
DROP POLICY IF EXISTS "Super admins can insert payment records" ON public.payment_history;
DROP POLICY IF EXISTS "Super admins can update payment records" ON public.payment_history;


DROP POLICY IF EXISTS "Company members view payment history" ON public.payment_history;
CREATE POLICY "Company members view payment history" ON public.payment_history
  FOR SELECT USING (public.can_access_company(company_id));


DROP POLICY IF EXISTS "Super admin full access" ON public.payment_history;
CREATE POLICY "Super admin full access" ON public.payment_history
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




-- ==========================================
-- Migration 011 — Fix global_config
--
-- STOP: Run the prerequisite check before this section:
--   SELECT config FROM public.global_config LIMIT 1;
-- Visually confirm no apiKey / secretKey / credentials remain in the output.
-- The UPDATE below strips known top-level keys but cannot reach arbitrarily
-- nested paths — manual verification is required.
-- ==========================================


UPDATE public.global_config
SET config = config
  - 'dimepay'
  - 'stripe'
  - 'api_keys'
  - 'dimepay_sandbox_api_key'
  - 'dimepay_sandbox_secret'
  - 'dimepay_api_key'
  - 'paymentGateway'
WHERE config IS NOT NULL;


DROP POLICY IF EXISTS "Super admins can view global config" ON public.global_config;
DROP POLICY IF EXISTS "Super admins can update global config" ON public.global_config;


DROP POLICY IF EXISTS "Authenticated users read global config" ON public.global_config;
CREATE POLICY "Authenticated users read global config" ON public.global_config
  FOR SELECT TO authenticated USING (true);


DROP POLICY IF EXISTS "Super admin writes global config" ON public.global_config;
CREATE POLICY "Super admin writes global config" ON public.global_config
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());




-- ==========================================
-- Migration 013 — employees.auth_user_id Column
-- ==========================================


ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;


CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id ON public.employees(auth_user_id);


-- Backfill: only links employees who have already accepted a portal invite
-- (employees without portal accounts correctly remain NULL)
UPDATE public.employees e
SET auth_user_id = au.id
FROM auth.users au
WHERE lower(trim(e.email)) = lower(trim(au.email))
  AND e.auth_user_id IS NULL;




-- ==========================================
-- Migration 013b — Upgrade email-based policies to auth_user_id
--
-- Runs immediately after the 013 backfill above.
-- Replaces all email-matching employee policies with the stable UUID FK.
-- Any employees where auth_user_id is still NULL (no portal account) correctly
-- fall through — they cannot authenticate as EMPLOYEE role anyway.
-- ==========================================


-- employees: replace email match with auth_user_id
DROP POLICY IF EXISTS "Employee reads own record" ON public.employees;
CREATE POLICY "Employee reads own record" ON public.employees
  FOR SELECT USING (
    public.auth_user_role() = 'EMPLOYEE'
    AND auth_user_id = auth.uid()
  );


-- leave_requests: upgrade both USING and WITH CHECK
DROP POLICY IF EXISTS "Employee manages own leave requests" ON public.leave_requests;
CREATE POLICY "Employee manages own leave requests" ON public.leave_requests
  FOR ALL
  USING (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );


-- timesheets: upgrade both USING and WITH CHECK
DROP POLICY IF EXISTS "Employee manages own timesheets" ON public.timesheets;
CREATE POLICY "Employee manages own timesheets" ON public.timesheets
  FOR ALL
  USING (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.auth_user_role() = 'EMPLOYEE'
    AND company_id = public.auth_user_company_id()
    AND employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );




-- ==========================================
-- Migration 014 — Fix plan_name Constraint
--
-- STOP: Verify existing stored values before running:
--   SELECT DISTINCT plan_name FROM public.subscriptions;
-- If any rows show 'professional' or 'enterprise', run:
--   UPDATE public.subscriptions SET plan_name = 'pro' WHERE plan_name = 'professional';
--   UPDATE public.subscriptions SET plan_name = 'pro' WHERE plan_name = 'enterprise';
-- New canonical values match planService.ts: free, starter, pro, reseller
-- 'subscription' retained as the DimePay webhook fallback default
-- ==========================================


-- ALTER TABLE public.subscriptions
--   DROP CONSTRAINT IF EXISTS subscriptions_plan_name_check;

-- ALTER TABLE public.subscriptions
--   DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;

-- ALTER TABLE public.subscriptions
--   ADD CONSTRAINT subscriptions_plan_name_check
--   CHECK (plan_name IN ('free', 'starter', 'pro', 'reseller', 'subscription', 'professional', 'enterprise', 'Free', 'Starter', 'Pro', 'Reseller'));




-- ==========================================
-- Migration 015 — RPC Helper for searchUserByEmail
--
-- CHANGES vs original:
--   - Added role guard: only OWNER/ADMIN/RESELLER/SUPER_ADMIN can call this
--     Original had no access control — any EMPLOYEE could enumerate account UUIDs
--   - Added SET search_path = ''
-- ==========================================


CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_input TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  result_id UUID;
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.app_users WHERE id = auth.uid();


  IF caller_role NOT IN ('OWNER', 'ADMIN', 'RESELLER', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Insufficient privileges to look up user by email';
  END IF;


  SELECT id INTO result_id
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim(email_input))
  LIMIT 1;


  RETURN result_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;


COMMIT;
