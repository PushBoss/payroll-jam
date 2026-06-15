-- ============================================================================
-- Repair recent self-signup owner profiles accidentally saved as EMPLOYEE
--
-- This intentionally does NOT change ordinary employee accounts. A row is only
-- repaired when:
--   1. app_users.role = 'EMPLOYEE'
--   2. the same user id owns a company via companies.owner_id
--   3. the app user or company was created on/after 2026-06-01
--
-- Preview before applying manually:
--
-- SELECT u.id, u.email, u.role AS current_role, c.id AS company_id, c.plan,
--        CASE WHEN lower(coalesce(c.plan, '')) IN ('reseller', 'enterprise')
--             THEN 'RESELLER' ELSE 'OWNER' END AS repaired_role
-- FROM public.app_users u
-- JOIN public.companies c ON c.owner_id = u.id
-- WHERE u.role = 'EMPLOYEE'
--   AND coalesce(u.created_at, c.created_at, now()) >= timestamptz '2026-06-01 00:00:00+00';
-- ============================================================================

DO $$
DECLARE
  v_cutoff timestamptz := timestamptz '2026-06-01 00:00:00+00';
  v_repaired_count integer := 0;
  v_member_count integer := 0;
BEGIN
  CREATE TEMP TABLE recent_signup_owner_repairs ON COMMIT DROP AS
    SELECT
      u.id AS user_id,
      u.email,
      c.id AS company_id,
      CASE
        WHEN lower(coalesce(c.plan, '')) IN ('reseller', 'enterprise') THEN 'RESELLER'
        ELSE 'OWNER'
      END AS repaired_role
    FROM public.app_users u
    JOIN public.companies c ON c.owner_id = u.id
    WHERE u.role = 'EMPLOYEE'
      AND coalesce(u.created_at, c.created_at, now()) >= v_cutoff;

  UPDATE public.app_users u
  SET
    role = repairs.repaired_role,
    company_id = repairs.company_id
  FROM recent_signup_owner_repairs repairs
  WHERE u.id = repairs.user_id;

  GET DIAGNOSTICS v_repaired_count = ROW_COUNT;

  INSERT INTO public.account_members (
    account_id,
    user_id,
    email,
    role,
    status,
    accepted_at,
    invited_at
  )
  SELECT
    company_id,
    user_id,
    lower(email),
    'OWNER',
    'accepted',
    now(),
    now()
  FROM recent_signup_owner_repairs repairs
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.account_members am
    WHERE am.account_id = repairs.company_id
      AND lower(am.email) = lower(repairs.email)
  );

  GET DIAGNOSTICS v_member_count = ROW_COUNT;

  RAISE NOTICE 'Repaired % recent owner signup profile(s); inserted % owner membership row(s).',
    v_repaired_count,
    v_member_count;
END;
$$;
