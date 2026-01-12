
-- IMPROVED: accept_reseller_invite_v2
-- 1. Uses TEXT for token to match frontend and table column
-- 2. SECURELY inserts into reseller_clients (bypassing RLS)
-- 3. SECURELY inserts reseller user into client company's account_members
-- 4. Links company to reseller across tables

CREATE OR REPLACE FUNCTION public.accept_reseller_invite_v2(
  p_invite_token TEXT,
  p_client_company_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_invite RECORD;
  v_client_id UUID;
  v_reseller_user_id UUID;
  v_reseller_email TEXT;
BEGIN
  -- 1. Fetch the invite
  SELECT * INTO v_invite FROM public.reseller_invites
  WHERE invite_token = p_invite_token AND status = 'PENDING';
  
  IF v_invite IS NULL THEN
    -- Check if it was already accepted
    SELECT * INTO v_invite FROM public.reseller_invites
    WHERE invite_token = p_invite_token AND status = 'ACCEPTED';
    
    IF v_invite IS NOT NULL THEN
       RETURN TRUE; -- Idempotent success
    END IF;
    
    RETURN FALSE;
  END IF;

  -- 2. Check expiry
  IF v_invite.expires_at < NOW() THEN
    RETURN FALSE;
  END IF;

  -- 3. Resolve client company
  v_client_id := p_client_company_id;
  IF v_client_id IS NULL THEN
    SELECT company_id INTO v_client_id FROM public.app_users
    WHERE LOWER(email) = LOWER(v_invite.invite_email)
    LIMIT 1;
  END IF;

  -- If still no company, we mark invite as accepted but can't link yet
  -- (This happens if signup isn't fully completed or RLS prevents finding the record)
  IF v_client_id IS NULL THEN
    UPDATE public.reseller_invites 
    SET status = 'ACCEPTED', accepted_at = NOW()
    WHERE id = v_invite.id;
    RETURN TRUE;
  END IF;

  -- 4. Create reseller-client relationship
  INSERT INTO public.reseller_clients (
    reseller_id, client_company_id, status, access_level,
    relationship_start_date, created_at, updated_at
  ) VALUES (
    v_invite.reseller_id, v_client_id, 'ACTIVE', 'FULL',
    NOW()::DATE, NOW(), NOW()
  )
  ON CONFLICT (reseller_id, client_company_id) DO UPDATE
  SET status = 'ACTIVE', updated_at = NOW();

  -- 5. Link company to reseller
  UPDATE public.companies
  SET reseller_id = v_invite.reseller_id
  WHERE id = v_client_id;

  -- 6. Add Reseller User as Team Member to Client Company
  -- Find the primary reseller user
  SELECT id, email INTO v_reseller_user_id, v_reseller_email
  FROM public.app_users
  WHERE company_id = v_invite.reseller_id
    AND role = 'RESELLER'
  LIMIT 1;

  -- Fallback to OWNER if no specific RESELLER role user found
  IF v_reseller_user_id IS NULL THEN
    SELECT id, email INTO v_reseller_user_id, v_reseller_email
    FROM public.app_users
    WHERE company_id = v_invite.reseller_id
      AND role = 'OWNER'
    LIMIT 1;
  END IF;

  -- If we found a reseller user, add them as a manager to the client company
  IF v_reseller_user_id IS NOT NULL THEN
    INSERT INTO public.account_members (
        account_id, user_id, email, role, status, 
        accepted_at, invited_at
    ) VALUES (
        v_client_id, v_reseller_user_id, LOWER(v_reseller_email), 
        'manager', 'accepted', NOW(), NOW()
    )
    ON CONFLICT (account_id, email) DO UPDATE
    SET user_id = v_reseller_user_id, status = 'accepted', updated_at = NOW();
  END IF;

  -- 7. Mark invite as accepted
  UPDATE public.reseller_invites
  SET status = 'ACCEPTED', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.accept_reseller_invite_v2(TEXT, UUID) TO authenticated;


-- NEW: Link existing company to reseller securely
CREATE OR REPLACE FUNCTION public.link_reseller_client_secure(
    p_client_email TEXT,
    p_reseller_company_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_client_company_id UUID;
    v_reseller_user_id UUID;
    v_reseller_email TEXT;
BEGIN
    -- 1. Find client company
    SELECT company_id INTO v_client_company_id
    FROM public.app_users
    WHERE LOWER(email) = LOWER(p_client_email)
    LIMIT 1;

    IF v_client_company_id IS NULL THEN
        -- Fallback to companies table if app_users record is missing company_id
        SELECT id INTO v_client_company_id
        FROM public.companies
        WHERE LOWER(name) IN (SELECT company_name FROM public.reseller_invites WHERE LOWER(invite_email) = LOWER(p_client_email))
        LIMIT 1;
    END IF;

    IF v_client_company_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. Create relationship
    INSERT INTO public.reseller_clients (
        reseller_id, client_company_id, status, access_level,
        relationship_start_date, created_at, updated_at
    ) VALUES (
        p_reseller_company_id, v_client_company_id, 'ACTIVE', 'FULL',
        NOW()::DATE, NOW(), NOW()
    )
    ON CONFLICT (reseller_id, client_company_id) DO UPDATE
    SET status = 'ACTIVE', updated_at = NOW();

    -- 3. Link company
    UPDATE public.companies
    SET reseller_id = p_reseller_company_id
    WHERE id = v_client_company_id;

    -- 4. Add reseller as team member
    SELECT id, email INTO v_reseller_user_id, v_reseller_email
    FROM public.app_users
    WHERE company_id = p_reseller_company_id
      AND role = 'RESELLER'
    LIMIT 1;

    IF v_reseller_user_id IS NULL THEN
        SELECT id, email INTO v_reseller_user_id, v_reseller_email
        FROM public.app_users
        WHERE company_id = p_reseller_company_id
          AND role = 'OWNER'
        LIMIT 1;
    END IF;

    IF v_reseller_user_id IS NOT NULL THEN
        INSERT INTO public.account_members (
            account_id, user_id, email, role, status, 
            accepted_at, invited_at
        ) VALUES (
            v_client_company_id, v_reseller_user_id, LOWER(v_reseller_email), 
            'manager', 'accepted', NOW(), NOW()
        )
        ON CONFLICT (account_id, email) DO UPDATE
        SET user_id = v_reseller_user_id, status = 'accepted', updated_at = NOW();
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.link_reseller_client_secure(TEXT, UUID) TO authenticated;
