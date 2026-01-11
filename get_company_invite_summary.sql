-- PROVIDE BASIC COMPANY DETAILS TO INVITED USERS WITHOUT EXPOSING FULL DATA
-- Returns the company name and plan for invitation overlays even before RLS grants access.

CREATE OR REPLACE FUNCTION get_company_invite_summary(
    p_company_id UUID
) RETURNS TABLE(company_name TEXT, company_plan TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT c.name::text,
           COALESCE(c.plan::text, 'Free')
    FROM public.companies c
    WHERE c.id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_company_invite_summary(UUID) TO authenticated;
