-- Secure cancellation of reseller invites
-- Ensures only the owning reseller (or their company owner) can delete a pending invite.

CREATE OR REPLACE FUNCTION cancel_reseller_invite_secure(
    p_invite_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_invite RECORD;
    v_reseller_company UUID;
BEGIN
    SELECT * INTO v_invite
    FROM public.reseller_invites
    WHERE id = p_invite_id
      AND status = 'PENDING';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Determine the current user's company id
    v_reseller_company := get_current_user_company_id();

    -- Ensure the caller controls the reseller company
    IF v_reseller_company IS DISTINCT FROM v_invite.reseller_id
       AND NOT check_is_company_owner(v_invite.reseller_id) THEN
        RETURN FALSE;
    END IF;

    DELETE FROM public.reseller_invites
    WHERE id = v_invite.id;

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION cancel_reseller_invite_secure(UUID) TO authenticated;
