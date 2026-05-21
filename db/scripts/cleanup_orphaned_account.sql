-- ============================================================
-- Clean up an orphaned/failed signup account and all its traces
-- 
-- USAGE: Replace the email below with the actual account email,
--        then run in Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  v_email        TEXT := 'REPLACE_WITH_ACCOUNT_EMAIL';   -- ← change this
  v_user_id      UUID;
  v_company_id   UUID;
BEGIN

  -- 1. Resolve user id from auth.users (source of truth)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No auth user found for email: %', v_email;
    -- Still attempt cleanup by email in case app_users has a ghost row
  ELSE
    RAISE NOTICE 'Found auth user id: %', v_user_id;
  END IF;

  -- 2. Find the company this user owns (if any was created)
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE owner_id = v_user_id
    LIMIT 1;
  END IF;

  IF v_company_id IS NOT NULL THEN
    RAISE NOTICE 'Found company id: %', v_company_id;
  END IF;

  -- -------------------------------------------------------
  -- 3. Delete child records first (FK order matters)
  -- -------------------------------------------------------

  -- Employees belonging to the company
  IF v_company_id IS NOT NULL THEN
    DELETE FROM public.employees        WHERE company_id = v_company_id;
    DELETE FROM public.pay_runs         WHERE company_id = v_company_id;
    DELETE FROM public.leave_requests   WHERE company_id = v_company_id;
    DELETE FROM public.timesheets       WHERE company_id = v_company_id;
    DELETE FROM public.tax_config       WHERE company_id = v_company_id;
    DELETE FROM public.integration_config WHERE company_id = v_company_id;
    DELETE FROM public.departments      WHERE company_id = v_company_id;
    DELETE FROM public.designations     WHERE company_id = v_company_id;
    DELETE FROM public.documents        WHERE company_id = v_company_id;
    DELETE FROM public.account_members  WHERE account_id = v_company_id;
    DELETE FROM public.subscriptions    WHERE company_id = v_company_id;
    DELETE FROM public.payment_history  WHERE company_id = v_company_id;
    RAISE NOTICE 'Deleted company child records for company %', v_company_id;
  END IF;

  -- Account members for this user across any company
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.account_members WHERE user_id = v_user_id;
  END IF;
  DELETE FROM public.account_members WHERE lower(email) = lower(v_email);

  -- Audit log entries (non-fatal if table doesn't exist)
  BEGIN
    IF v_user_id IS NOT NULL THEN
      DELETE FROM public.audit_log WHERE user_id = v_user_id::text;
    END IF;
    DELETE FROM public.audit_log WHERE lower(user_email) = lower(v_email);
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'audit_log table not found — skipping';
  END;

  -- 4. Delete the app_users row
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.app_users WHERE id = v_user_id;
  END IF;
  DELETE FROM public.app_users WHERE lower(email) = lower(v_email);
  RAISE NOTICE 'Deleted app_users row';

  -- 5. Delete the company record itself
  IF v_company_id IS NOT NULL THEN
    DELETE FROM public.companies WHERE id = v_company_id;
    RAISE NOTICE 'Deleted company %', v_company_id;
  END IF;

  -- 6. Delete from auth.users (requires service_role — works in SQL Editor)
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
    RAISE NOTICE 'Deleted auth user %', v_user_id;
  ELSE
    -- Try by email if we didn't find the id earlier
    DELETE FROM auth.users WHERE lower(email) = lower(v_email);
    RAISE NOTICE 'Attempted auth.users delete by email';
  END IF;

  RAISE NOTICE '✅ Cleanup complete for: %', v_email;

END $$;

-- ============================================================
-- Verify nothing is left behind:
-- ============================================================
-- SELECT * FROM auth.users         WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
-- SELECT * FROM public.app_users   WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
-- SELECT * FROM public.companies   WHERE lower(email) = lower('REPLACE_WITH_ACCOUNT_EMAIL');
-- ============================================================
