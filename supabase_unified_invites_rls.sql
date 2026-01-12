-- ============================================================================
-- UNIFIED INVITES & RESELLER RLS FIX
-- Consolidates all account_members, reseller_invites, and reseller_clients 
-- policies into one authoritative migration.
-- Prevents recursive RLS loops and allows team invites for non-registered users.
-- ============================================================================

-- ============================================================================
-- SECTION 1: DROP ALL EXISTING CONFLICTING POLICIES
-- ============================================================================

-- Drop old account_members policies from previous migrations
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_members_select" ON public.account_members;
DROP POLICY IF EXISTS "account_members_insert" ON public.account_members;
DROP POLICY IF EXISTS "account_members_update" ON public.account_members;
DROP POLICY IF EXISTS "account_members_delete" ON public.account_members;
DROP POLICY IF EXISTS "account_members_view_own" ON public.account_members;
DROP POLICY IF EXISTS "account_members_insert_own_company" ON public.account_members;
DROP POLICY IF EXISTS "account_members_update_own_company" ON public.account_members;
DROP POLICY IF EXISTS "account_members_delete_own_company" ON public.account_members;

-- Drop old reseller_invites policies
ALTER TABLE public.reseller_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reseller_invites_select" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_insert" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_update" ON public.reseller_invites;
DROP POLICY IF EXISTS "reseller_invites_delete" ON public.reseller_invites;

-- Drop old reseller_clients policies
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reseller_clients_select" ON public.reseller_clients;
DROP POLICY IF EXISTS "Allow authenticated users to insert reseller_clients" ON public.reseller_clients;

-- ============================================================================
-- SECTION 2: ENSURE HELPER FUNCTIONS EXIST (Non-Recursive)
-- ============================================================================

-- Helper 1: Get current user's owned company ID (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies 
  WHERE owner_id = auth.uid() LIMIT 1;
  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_current_user_company_id() TO authenticated;

-- Helper 2: Check if user is company owner (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_is_company_owner(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.companies 
    WHERE id = p_company_id AND owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.check_is_company_owner(UUID) TO authenticated;

-- Helper 3: Get user ID by email (SECURITY DEFINER - for team invites)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID AS $$
DECLARE
  found_id UUID;
BEGIN
  SELECT id INTO found_id FROM public.app_users
  WHERE LOWER(email) = LOWER(p_email);
  RETURN found_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;

-- Helper 4: Check if user is reseller for company (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_reseller_for_company(p_company_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_my_company UUID;
BEGIN
  v_my_company := get_current_user_company_id();
  IF v_my_company IS NULL THEN RETURN FALSE; END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.reseller_clients 
    WHERE reseller_id = v_my_company AND client_company_id = p_company_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_reseller_for_company(UUID) TO authenticated;

-- Helper 5: Get company invite summary (SECURITY DEFINER - for display)
CREATE OR REPLACE FUNCTION public.get_company_invite_summary(p_company_id UUID)
RETURNS TABLE(company_name TEXT, company_plan TEXT) AS $$
BEGIN
  RETURN QUERY SELECT c.name, c.plan FROM public.companies c WHERE c.id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_company_invite_summary(UUID) TO authenticated;

-- ============================================================================
-- SECTION 3: TEAM INVITES (account_members) - NEW SECURE RPC
-- ============================================================================

-- RPC to safely create team member invitations (bypasses RLS for INSERT)
CREATE OR REPLACE FUNCTION public.invite_team_member_secure(
  p_account_id UUID,
  p_email TEXT,
  p_role TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  account_id UUID,
  user_id UUID,
  email TEXT,
  role TEXT,
  status TEXT,
  invited_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Verify user is company owner
  IF NOT check_is_company_owner(p_account_id) THEN
    RAISE EXCEPTION 'Not authorized to invite members to this company';
  END IF;

  RETURN QUERY
  INSERT INTO public.account_members (
    account_id,
    user_id,
    email,
    role,
    status,
    invited_at
  ) VALUES (
    p_account_id,
    p_user_id,
    LOWER(p_email),
    p_role,
    'pending',
    NOW()
  )
  ON CONFLICT (account_id, email) DO UPDATE 
  SET status = 'pending', invited_at = NOW()
  RETURNING
    account_members.id,
    account_members.account_id,
    account_members.user_id,
    account_members.email,
    account_members.role,
    account_members.status,
    account_members.invited_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.invite_team_member_secure(UUID, TEXT, TEXT, UUID) TO authenticated;

-- ============================================================================
-- SECTION 4: ACCOUNT_MEMBERS RLS POLICIES (Clean, Non-Recursive)
-- ============================================================================

-- SELECT: Owners see all members, Members see themselves
CREATE POLICY "account_members_select" ON public.account_members
FOR SELECT
USING (
  -- Owner of company can see all members
  check_is_company_owner(account_id)
  OR
  -- User can see themselves (even if pending)
  user_id = auth.uid()
);

-- INSERT: Only company owners via RPC or direct (RPC preferred)
CREATE POLICY "account_members_insert" ON public.account_members
FOR INSERT
WITH CHECK (
  check_is_company_owner(account_id)
);

-- UPDATE: Owners can update role/status, Members can accept invites
CREATE POLICY "account_members_update" ON public.account_members
FOR UPDATE
USING (
  -- Owner can update any member
  check_is_company_owner(account_id)
  OR
  -- Member can update themselves (accept invite)
  user_id = auth.uid()
)
WITH CHECK (
  check_is_company_owner(account_id)
  OR
  user_id = auth.uid()
);

-- DELETE: Only owners can remove members
CREATE POLICY "account_members_delete" ON public.account_members
FOR DELETE
USING (
  check_is_company_owner(account_id)
);

-- ============================================================================
-- SECTION 5: RESELLER_INVITES RLS POLICIES  (Clean, Non-Recursive)
-- ============================================================================

-- SELECT: Reseller sees own invites, invitee sees invites sent to them
CREATE POLICY "reseller_invites_select" ON public.reseller_invites
FOR SELECT
USING (
  -- Reseller owner can see own invites
  reseller_id = get_current_user_company_id()
  OR
  -- Invitee can see invites sent to their email
  invite_email = (auth.jwt() ->> 'email')
);

-- INSERT: Only reseller owners can create invites
CREATE POLICY "reseller_invites_insert" ON public.reseller_invites
FOR INSERT
WITH CHECK (
  reseller_id = get_current_user_company_id()
);

-- UPDATE: Reseller owner or invitee can update
CREATE POLICY "reseller_invites_update" ON public.reseller_invites
FOR UPDATE
USING (
  reseller_id = get_current_user_company_id()
  OR
  invite_email = (auth.jwt() ->> 'email')
)
WITH CHECK (
  reseller_id = get_current_user_company_id()
  OR
  invite_email = (auth.jwt() ->> 'email')
);

-- DELETE: Only reseller owner can delete
CREATE POLICY "reseller_invites_delete" ON public.reseller_invites
FOR DELETE
USING (
  reseller_id = get_current_user_company_id()
);

-- ============================================================================
-- SECTION 6: RESELLER_CLIENTS RLS POLICIES (Clean, Non-Recursive)
-- ============================================================================

-- SELECT: Reseller sees own clients, client sees own resellers
CREATE POLICY "reseller_clients_select" ON public.reseller_clients
FOR SELECT
USING (
  -- Reseller can see own clients
  reseller_id = get_current_user_company_id()
  OR
  -- Client can see own resellers
  client_company_id = get_current_user_company_id()
);

-- INSERT: Only reseller owners can create relationships
CREATE POLICY "reseller_clients_insert" ON public.reseller_clients
FOR INSERT
WITH CHECK (
  reseller_id = get_current_user_company_id()
);

-- UPDATE: Only reseller can update
CREATE POLICY "reseller_clients_update" ON public.reseller_clients
FOR UPDATE
USING (
  reseller_id = get_current_user_company_id()
)
WITH CHECK (
  reseller_id = get_current_user_company_id()
);

-- DELETE: Only reseller can delete relationship
CREATE POLICY "reseller_clients_delete" ON public.reseller_clients
FOR DELETE
USING (
  reseller_id = get_current_user_company_id()
);

-- ============================================================================
-- SECTION 7: SECURE RPCs FOR RESELLER OPERATIONS
-- ============================================================================

-- RPC to accept reseller invite (handles new/existing users)
CREATE OR REPLACE FUNCTION public.accept_reseller_invite_v2(
  p_invite_token UUID,
  p_client_company_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_invite RECORD;
  v_client_id UUID;
BEGIN
  -- Fetch the invite
  SELECT * INTO v_invite FROM public.reseller_invites
  WHERE invite_token = p_invite_token AND status = 'PENDING';
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found or already accepted';
  END IF;

  -- Check expiry
  IF v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  -- Resolve client company
  v_client_id := p_client_company_id;
  IF v_client_id IS NULL THEN
    SELECT company_id INTO v_client_id FROM public.app_users
    WHERE LOWER(email) = LOWER(v_invite.invite_email);
  END IF;

  IF v_client_id IS NULL THEN
    -- Invitee doesn't have a company yet - this will be created during signup
    -- For now, just mark invite as accepted; signup flow will complete the link
    UPDATE public.reseller_invites 
    SET status = 'ACCEPTED', accepted_at = NOW()
    WHERE id = v_invite.id;
    RETURN TRUE;
  END IF;

  -- Create reseller-client relationship
  INSERT INTO public.reseller_clients (
    reseller_id, client_company_id, status, access_level,
    relationship_start_date, created_at, updated_at
  ) VALUES (
    v_invite.reseller_id, v_client_id, 'ACTIVE', 'FULL',
    NOW()::DATE, NOW(), NOW()
  )
  ON CONFLICT (reseller_id, client_company_id) DO UPDATE
  SET status = 'ACTIVE', updated_at = NOW();

  -- Update company's reseller_id
  UPDATE public.companies
  SET reseller_id = v_invite.reseller_id
  WHERE id = v_client_id;

  -- Mark invite as accepted
  UPDATE public.reseller_invites
  SET status = 'ACCEPTED', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in accept_reseller_invite_v2: %', SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.accept_reseller_invite_v2(UUID, UUID) TO authenticated;

-- RPC to cancel reseller invite securely
CREATE OR REPLACE FUNCTION public.cancel_reseller_invite_secure(p_invite_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_reseller_id UUID;
BEGIN
  -- Get the reseller_id from the invite
  SELECT reseller_id INTO v_reseller_id FROM public.reseller_invites
  WHERE id = p_invite_id;

  IF v_reseller_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  -- Verify user is reseller owner
  IF get_current_user_company_id() != v_reseller_id THEN
    RAISE EXCEPTION 'Not authorized to cancel this invite';
  END IF;

  DELETE FROM public.reseller_invites WHERE id = p_invite_id;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_reseller_invite_secure(UUID) TO authenticated;

-- RPC to remove reseller-client relationship securely
CREATE OR REPLACE FUNCTION public.remove_reseller_client_secure(
  p_reseller_id UUID,
  p_client_company_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify user is reseller owner
  IF get_current_user_company_id() != p_reseller_id THEN
    RAISE EXCEPTION 'Not authorized to remove this client';
  END IF;

  DELETE FROM public.reseller_clients
  WHERE reseller_id = p_reseller_id AND client_company_id = p_client_company_id;

  -- Clear company's reseller_id
  UPDATE public.companies
  SET reseller_id = NULL
  WHERE id = p_client_company_id AND reseller_id = p_reseller_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.remove_reseller_client_secure(UUID, UUID) TO authenticated;

-- ============================================================================
-- SECTION 8: ADD EXPIRY COLUMN TO account_members (Optional but Recommended)
-- ============================================================================

-- Add expires_at column if it doesn't exist (for invitation expiry)
ALTER TABLE public.account_members
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days');

-- Set default for existing rows
UPDATE public.account_members
SET expires_at = invited_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

-- ============================================================================
-- SECTION 9: SUMMARY COMMENT
-- ============================================================================

/*
MIGRATION SUMMARY:
==================

ACCOUNT_MEMBERS (Team Invites):
- Supports both registered and non-registered email invitations
- Use invite_team_member_secure() RPC for INSERTs (recommended)
- Auto-accept on first login via acceptPendingInvitationsByEmail()
- Expiry set to 7 days by default (customizable)

RESELLER_INVITES & RESELLER_CLIENTS (Reseller Add Company):
- Use accept_reseller_invite_v2() RPC to accept invites
- Handles both existing companies and new user signups
- Use cancel_reseller_invite_secure() and remove_reseller_client_secure() for deletions
- No recursive RLS loops - all operations bypass RLS via SECURITY DEFINER functions

KEY CHANGES:
- All policies use SECURITY DEFINER helpers to prevent infinite loops
- Unified migration prevents conflicting policy definitions
- Team invites work for non-registered users
- Role semantics: ADMIN (full access except billing), MANAGER (view-only, reseller-specific)
*/
