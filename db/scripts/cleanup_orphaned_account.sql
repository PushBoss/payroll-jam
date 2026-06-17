-- ============================================================
-- Clean up a failed/orphaned signup account for a fresh start
--
-- Run this in the Supabase SQL Editor.
--
-- SAFETY DEFAULT:
--   v_execute := false previews the account, company, and data that would be
--   deleted. Set v_execute := true only after reviewing the NOTICE output.
--
-- Intended use:
--   - A company signup failed in the old flow.
--   - The auth/app_users account is stuck with the wrong role or no company.
--   - The customer wants the same email cleared so they can sign up again.
--
-- Not intended for:
--   - Deleting active customers with payroll history.
--   - Deleting an email that is also an employee portal login elsewhere,
--     unless you explicitly set v_force_if_employee_elsewhere := true.
-- ============================================================

DO $$
DECLARE
  v_email                                 TEXT := 'REPLACE_WITH_ACCOUNT_EMAIL';
  v_execute                               BOOLEAN := false;
  v_allow_delete_company_with_payroll     BOOLEAN := false;
  v_force_if_employee_elsewhere           BOOLEAN := false;

  v_auth_user_id                          UUID;
  v_app_user_id                           UUID;
  v_app_user_role                         TEXT;
  v_app_user_company_id                   UUID;
  v_target_company_ids                    UUID[] := ARRAY[]::UUID[];
  v_company_id                            UUID;
  v_employee_elsewhere_count              INTEGER := 0;
  v_payroll_history_count                 INTEGER := 0;
  v_company_employee_count                INTEGER := 0;
  v_deleted_count                         INTEGER := 0;
BEGIN
  v_email := lower(btrim(v_email));

  IF v_email = '' OR v_email = 'replace_with_account_email' THEN
    RAISE EXCEPTION 'Set v_email before running this script.';
  END IF;

  SELECT id
    INTO v_auth_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  SELECT id, role, company_id
    INTO v_app_user_id, v_app_user_role, v_app_user_company_id
  FROM public.app_users
  WHERE lower(email) = v_email
  LIMIT 1;

  SELECT COALESCE(array_agg(DISTINCT company_id), ARRAY[]::UUID[])
    INTO v_target_company_ids
  FROM (
    SELECT c.id AS company_id
    FROM public.companies c
    WHERE c.owner_id = COALESCE(v_auth_user_id, v_app_user_id)

    UNION

    SELECT v_app_user_company_id
    WHERE v_app_user_role IN ('OWNER', 'RESELLER')
      AND v_app_user_company_id IS NOT NULL

    UNION

    SELECT am.account_id
    FROM public.account_members am
    WHERE lower(am.email) = v_email
      AND am.role IN ('OWNER', 'RESELLER')
      AND am.status IN ('accepted', 'pending')
  ) company_candidates
  WHERE company_id IS NOT NULL;

  SELECT COUNT(*)
    INTO v_employee_elsewhere_count
  FROM public.employees e
  WHERE lower(e.email) = v_email
    AND NOT (e.company_id = ANY(v_target_company_ids));

  SELECT COUNT(*)
    INTO v_payroll_history_count
  FROM public.pay_runs pr
  WHERE pr.company_id = ANY(v_target_company_ids);

  SELECT COUNT(*)
    INTO v_company_employee_count
  FROM public.employees e
  WHERE e.company_id = ANY(v_target_company_ids);

  RAISE NOTICE 'Cleanup preview for %', v_email;
  RAISE NOTICE 'execute=% allow_delete_company_with_payroll=% force_if_employee_elsewhere=%',
    v_execute, v_allow_delete_company_with_payroll, v_force_if_employee_elsewhere;
  RAISE NOTICE 'auth.users id: %', COALESCE(v_auth_user_id::TEXT, '<none>');
  RAISE NOTICE 'app_users id: %, role: %, company_id: %',
    COALESCE(v_app_user_id::TEXT, '<none>'),
    COALESCE(v_app_user_role, '<none>'),
    COALESCE(v_app_user_company_id::TEXT, '<none>');
  RAISE NOTICE 'target company ids: %', COALESCE(array_to_string(v_target_company_ids, ', '), '<none>');
  RAISE NOTICE 'target company employees: %, target company pay runs: %, employee records with this email elsewhere: %',
    v_company_employee_count, v_payroll_history_count, v_employee_elsewhere_count;

  IF v_employee_elsewhere_count > 0 AND NOT v_force_if_employee_elsewhere THEN
    RAISE EXCEPTION
      'Refusing cleanup: this email is an employee record in another company. Use a different company-owner email, or set v_force_if_employee_elsewhere := true if you intentionally want to remove the auth login.';
  END IF;

  IF v_payroll_history_count > 0 AND NOT v_allow_delete_company_with_payroll THEN
    RAISE EXCEPTION
      'Refusing cleanup: target company has payroll history. Set v_allow_delete_company_with_payroll := true only if this company data should be permanently removed.';
  END IF;

  IF NOT v_execute THEN
    RAISE NOTICE 'Preview only. Set v_execute := true to perform the cleanup.';
    RETURN;
  END IF;

  -- Delete company-owned data. Most FK relationships are ON DELETE CASCADE, but
  -- these explicit deletes make the script work across older schema variants.
  FOREACH v_company_id IN ARRAY v_target_company_ids LOOP
    RAISE NOTICE 'Deleting company-scoped data for company %', v_company_id;

    DELETE FROM public.timesheets WHERE company_id = v_company_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  timesheets: %', v_deleted_count;

    DELETE FROM public.leave_requests WHERE company_id = v_company_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  leave_requests: %', v_deleted_count;

    DELETE FROM public.pay_runs WHERE company_id = v_company_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  pay_runs: %', v_deleted_count;

    DELETE FROM public.employees WHERE company_id = v_company_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  employees: %', v_deleted_count;

    BEGIN
      DELETE FROM public.departments WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  departments table not found; skipping';
    END;

    BEGIN
      DELETE FROM public.designations WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  designations table not found; skipping';
    END;

    BEGIN
      DELETE FROM public.documents WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  documents table not found; skipping';
    END;

    BEGIN
      DELETE FROM public.subscriptions WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  subscriptions table not found; skipping';
    END;

    BEGIN
      DELETE FROM public.payment_history WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  payment_history table not found; skipping';
    END;

    DELETE FROM public.account_members WHERE account_id = v_company_id;

    BEGIN
      DELETE FROM public.company_locations WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  company_locations table not found; skipping';
    END;

    BEGIN
      DELETE FROM public.dimepay_billing_intents WHERE company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  dimepay_billing_intents table not found; skipping';
    END;

    -- Do not delete dimepay_ledger. It is intentionally append-only.

    BEGIN
      DELETE FROM public.reseller_clients
      WHERE reseller_id = v_company_id
         OR client_company_id = v_company_id;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '  reseller_clients table not found; skipping';
    END;

    BEGIN
      DELETE FROM public.reseller_invites
      WHERE reseller_id = v_company_id
         OR lower(client_email) = v_email;
    EXCEPTION
      WHEN undefined_table THEN
      RAISE NOTICE '  reseller_invites table not found; skipping';
      WHEN undefined_column THEN
        DELETE FROM public.reseller_invites
        WHERE reseller_id = v_company_id
           OR lower(invite_email) = v_email;
    END;

    DELETE FROM public.companies WHERE id = v_company_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  companies: %', v_deleted_count;
  END LOOP;

  -- Delete user/account membership traces.
  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM public.account_members WHERE user_id = v_auth_user_id;
  END IF;
  IF v_app_user_id IS NOT NULL THEN
    DELETE FROM public.account_members WHERE user_id = v_app_user_id;
  END IF;
  DELETE FROM public.account_members WHERE lower(email) = v_email;

  BEGIN
    IF v_auth_user_id IS NOT NULL THEN
      DELETE FROM public.audit_logs WHERE actor_id = v_auth_user_id;
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'audit_logs table not found; skipping';
    WHEN undefined_column THEN
      RAISE NOTICE 'audit_logs shape did not match expected columns; skipping';
  END;

  BEGIN
    IF v_auth_user_id IS NOT NULL THEN
      DELETE FROM public.audit_log WHERE user_id = v_auth_user_id::TEXT;
    END IF;
    DELETE FROM public.audit_log WHERE lower(user_email) = v_email;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'audit_log table not found; skipping';
  END;

  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM public.app_users WHERE id = v_auth_user_id;
  END IF;
  IF v_app_user_id IS NOT NULL THEN
    DELETE FROM public.app_users WHERE id = v_app_user_id;
  END IF;
  DELETE FROM public.app_users WHERE lower(email) = v_email;

  -- Remove auth identity last so a failed cleanup leaves the account recoverable.
  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_user_id;
    RAISE NOTICE 'Deleted auth user %', v_auth_user_id;
  ELSE
    DELETE FROM auth.users WHERE lower(email) = v_email;
    RAISE NOTICE 'Attempted auth user delete by email';
  END IF;

  RAISE NOTICE 'Cleanup complete for %', v_email;
END $$;

-- ============================================================
-- Verification queries
-- ============================================================
-- SELECT id, email FROM auth.users WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
-- SELECT id, email, role, company_id FROM public.app_users WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
-- SELECT id, name, email, owner_id FROM public.companies WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
-- SELECT id, company_id, email FROM public.employees WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
