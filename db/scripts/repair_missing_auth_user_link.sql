-- ============================================================
-- Repair app_users profile with missing auth_user_id
--
-- Run this in Supabase SQL Editor.
--
-- Use when:
--   - public.app_users row exists
--   - app_users.company_id is set
--   - app_users.auth_user_id is NULL or stale
--   - auth.users has an identity with the same email
--
-- Safety:
--   - v_execute := false previews the repair.
--   - Set v_execute := true only after reviewing NOTICE output.
--
-- Example current case:
--   v_app_user_id := '75d3642a-b84d-46a1-ab66-97be31449911';
--   v_company_id  := 'b76e3ddc-900b-4ff2-92a4-971bf7b34d72';
-- ============================================================

DO $$
DECLARE
  v_app_user_id UUID := '75d3642a-b84d-46a1-ab66-97be31449911';
  v_company_id UUID := 'b76e3ddc-900b-4ff2-92a4-971bf7b34d72';
  v_execute BOOLEAN := false;

  v_email TEXT;
  v_role TEXT;
  v_current_auth_user_id UUID;
  v_matching_auth_user_id UUID;
  v_conflicting_profile_count INTEGER := 0;
  v_company_owner_id UUID;
BEGIN
  SELECT email, role, auth_user_id
    INTO v_email, v_role, v_current_auth_user_id
  FROM public.app_users
  WHERE id = v_app_user_id
    AND company_id = v_company_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No app_users profile found for app user % and company %', v_app_user_id, v_company_id;
  END IF;

  SELECT id
    INTO v_matching_auth_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  SELECT COUNT(*)
    INTO v_conflicting_profile_count
  FROM public.app_users
  WHERE auth_user_id = v_matching_auth_user_id
    AND id <> v_app_user_id;

  SELECT owner_id
    INTO v_company_owner_id
  FROM public.companies
  WHERE id = v_company_id;

  RAISE NOTICE 'Repair preview';
  RAISE NOTICE 'execute: %', v_execute;
  RAISE NOTICE 'app_users.id: %', v_app_user_id;
  RAISE NOTICE 'company_id: %', v_company_id;
  RAISE NOTICE 'email: %', v_email;
  RAISE NOTICE 'role: %', v_role;
  RAISE NOTICE 'current app_users.auth_user_id: %', COALESCE(v_current_auth_user_id::TEXT, '<null>');
  RAISE NOTICE 'matching auth.users.id by email: %', COALESCE(v_matching_auth_user_id::TEXT, '<none>');
  RAISE NOTICE 'company.owner_id: %', COALESCE(v_company_owner_id::TEXT, '<null>');
  RAISE NOTICE 'other profiles already linked to matching auth user: %', v_conflicting_profile_count;

  IF v_matching_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users identity exists with email %. Create/restore auth identity first.', v_email;
  END IF;

  IF v_conflicting_profile_count > 0 THEN
    RAISE EXCEPTION 'Refusing repair: matching auth user is already linked to another app_users profile.';
  END IF;

  IF NOT v_execute THEN
    RAISE NOTICE 'Preview only. Set v_execute := true to apply the repair.';
    RETURN;
  END IF;

  UPDATE public.app_users
  SET auth_user_id = v_matching_auth_user_id
  WHERE id = v_app_user_id
    AND company_id = v_company_id;

  UPDATE public.companies
  SET owner_id = v_matching_auth_user_id
  WHERE id = v_company_id
    AND upper(v_role) IN ('OWNER', 'RESELLER')
    AND (owner_id IS NULL OR owner_id = v_app_user_id);

  UPDATE public.account_members
  SET user_id = v_matching_auth_user_id
  WHERE account_id = v_company_id
    AND lower(email) = lower(v_email);

  RAISE NOTICE 'Repair complete.';
END $$;
