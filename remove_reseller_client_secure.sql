-- SECURELY REMOVE A RESELLER CLIENT RELATIONSHIP
-- Ensures only the reseller (or company owner) can sever the link and it also clears companies.reseller_id.

CREATE OR REPLACE FUNCTION remove_reseller_client_secure(
    p_reseller_id UUID,
    p_client_company_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_company UUID;
BEGIN
    v_current_company := get_current_user_company_id();

    IF v_current_company IS DISTINCT FROM p_reseller_id
       AND NOT check_is_company_owner(p_reseller_id) THEN
        RETURN FALSE;
    END IF;

    DELETE FROM public.reseller_clients
    WHERE reseller_id = p_reseller_id
      AND client_company_id = p_client_company_id;

    UPDATE public.companies
    SET reseller_id = NULL
    WHERE id = p_client_company_id
      AND reseller_id = p_reseller_id;

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION remove_reseller_client_secure(UUID, UUID) TO authenticated;
