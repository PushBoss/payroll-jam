-- ============================================================================
-- Harden signup profile role creation
--
-- Company self-signups must never land in app_users as EMPLOYEE. The client now
-- sends explicit signup metadata and an OWNER/RESELLER role for company signup,
-- but this function also protects retries where an earlier partial signup left
-- the same auth id with an EMPLOYEE profile.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_user_id    UUID,
  p_email      TEXT,
  p_name       TEXT,
  p_role       TEXT DEFAULT 'OWNER'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := upper(trim(coalesce(p_role, 'OWNER')));
  v_signup_flow TEXT;
BEGIN
  SELECT raw_user_meta_data->>'signup_flow'
  INTO v_signup_flow
  FROM auth.users
  WHERE id = p_user_id;

  -- Guard: the p_user_id must match an actual auth user
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % does not exist in auth.users', p_user_id;
  END IF;

  -- A company signup should recover to OWNER if an old/bad client sends EMPLOYEE.
  IF v_role = 'EMPLOYEE' AND v_signup_flow = 'company_signup' THEN
    v_role := 'OWNER';
  END IF;

  -- Guard: only allowed roles
  IF v_role NOT IN ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  INSERT INTO public.app_users (id, auth_user_id, email, name, role, is_onboarded)
  VALUES (p_user_id, p_user_id, lower(trim(p_email)), trim(p_name), v_role, false)
  ON CONFLICT (id) DO UPDATE
  SET
    auth_user_id = EXCLUDED.auth_user_id,
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = CASE
      WHEN public.app_users.role = 'EMPLOYEE' AND EXCLUDED.role IN ('OWNER', 'RESELLER')
        THEN EXCLUDED.role
      ELSE public.app_users.role
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;
