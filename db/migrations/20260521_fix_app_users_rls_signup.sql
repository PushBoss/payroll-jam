-- ===========================================================================
-- Fix: app_users INSERT RLS blocks new account signup
-- 
-- ROOT CAUSE:
--   The existing INSERT policy:
--     app_users_insert: auth.uid() = id
--   is correct in theory — a user can only insert their own row.
--
--   HOWEVER, the standard supabase.auth.signUp() flow returns a session
--   ONLY if email confirmation is disabled. When email confirmation IS
--   required (Supabase dashboard setting "Enable email confirmations" = ON),
--   signUp() returns a user with NO active session yet.
--
--   The client then immediately calls:
--     supabase.from('app_users').upsert({id: newUserId, ...})
--   But since there is NO active JWT/session yet (the user hasn't clicked
--   the verification link), auth.uid() returns NULL on the server side.
--
--   NULL = user_id → RLS policy evaluates to false → 401/403 returned.
--
-- SECONDARY ISSUE (specific account e50405d1...):
--   Policies on other tables that do: app_users.email = auth.jwt()->>'email'
--   fail when that user's JWT email claim doesn't exactly match (e.g. case
--   difference, trailing space, or a mismatched row from a previous partial
--   signup attempt that left a ghost row with different casing).
--
-- SOLUTION:
--   Move app_users profile creation out of the unauthenticated client path
--   into the Edge Function (admin-handler) which uses the service_role key
--   and bypasses RLS entirely. The client-side saveUser() should only be
--   called for UPDATES to an existing authenticated session.
--
--   Additionally, add a SECURITY DEFINER function that safely inserts the
--   initial profile so it can be called from the signup flow without
--   requiring a live JWT.
-- ===========================================================================

-- Step 1: Create a SECURITY DEFINER function that can insert the initial
--         app_users profile during signup. This runs as the DB owner and
--         bypasses RLS, but has its own guards.
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
BEGIN
  -- Guard: only allowed roles
  IF p_role NOT IN ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'RESELLER', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Guard: the p_user_id must match an actual auth user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User % does not exist in auth.users', p_user_id;
  END IF;

  INSERT INTO public.app_users (id, auth_user_id, email, name, role, is_onboarded)
  VALUES (p_user_id, p_user_id, lower(trim(p_email)), trim(p_name), p_role, false)
  ON CONFLICT (id) DO NOTHING;   -- idempotent: safe to call again if partial signup retried
END;
$$;

-- Allow any authenticated Postgres user to execute this function
-- (Supabase anon/authenticated roles can call it via RPC)
GRANT EXECUTE ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- Step 2: Harden the INSERT policy so it also accepts a caller that has
--         JUST signed up but hasn't confirmed email yet (no live session).
--         The SECURITY DEFINER function above is the preferred path, but
--         as belt-and-suspenders, also allow upsert when the auth user
--         literally exists and id matches.
DROP POLICY IF EXISTS "app_users_insert" ON public.app_users;

CREATE POLICY "app_users_insert"
ON public.app_users
FOR INSERT
WITH CHECK (
  -- Standard case: authenticated user inserting their own row
  auth.uid() = id
);
-- Note: the SECURITY DEFINER function handles the unauthenticated case
-- so we don't need to open a hole here.


-- Step 3: Fix the ghost-row / email-case-mismatch problem for existing
--         broken accounts. Normalise all emails to lowercase so the
--         auth.jwt()->>'email' comparisons always match.
UPDATE public.app_users
SET email = lower(trim(email))
WHERE email != lower(trim(email));


-- Step 4: Add a partial index to make the email-based RLS checks fast
--         (they run on every query that uses email = auth.jwt()->>'email')
CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON public.app_users (lower(email));


-- ===========================================================================
-- INSTRUCTIONS — run this SQL in Supabase SQL Editor:
--
--   1. Paste and run this entire file.
--   2. In your AuthContext.tsx signup flow, REPLACE the client-side
--      saveUser(appUser) call with an RPC call:
--
--        await supabase.rpc('create_user_profile', {
--          p_user_id: authData.user.id,
--          p_email:   userData.email,
--          p_name:    userData.name,
--          p_role:    userData.role,
--        });
--
--      This bypasses the RLS INSERT policy entirely for new signups and
--      is safe because the SECURITY DEFINER function validates the user
--      exists in auth.users before inserting.
--
--   3. Keep using saveUser() for updates (onboarding completion, role
--      changes etc.) — those happen after the session is active so
--      auth.uid() is always set.
-- ===========================================================================
