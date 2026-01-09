
-- Function to accept reseller invite securely (bypassing Client RLS for this specific action)
CREATE OR REPLACE FUNCTION accept_reseller_invite_v2(
    p_invite_token TEXT,
    p_client_company_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_invite RECORD;
    v_reseller_id UUID;
BEGIN
    -- 1. Find the invite (and ensure it's still PENDING and NOT EXPIRED)
    SELECT * INTO v_invite
    FROM reseller_invites
    WHERE invite_token = p_invite_token
      AND status = 'PENDING'
      AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    v_reseller_id := v_invite.reseller_id;

    -- 2. Create the reseller_client relationship
    -- We use ON CONFLICT DO NOTHING just in case it was already created but invite status wasn't updated
    INSERT INTO reseller_clients (reseller_id, client_company_id, status, access_level)
    VALUES (v_reseller_id, p_client_company_id, 'ACTIVE', 'FULL')
    ON CONFLICT (reseller_id, client_company_id) DO NOTHING;

    -- 3. Mark the invite as ACCEPTED
    UPDATE reseller_invites
    SET status = 'ACCEPTED',
        accepted_at = NOW()
    WHERE id = v_invite.id;

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    -- Log error (optional) or just return false
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
