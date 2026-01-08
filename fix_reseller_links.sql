
-- 1. Check if the accepted invite exists but is missing the client link
DO $$
DECLARE
    r_invite RECORD;
    v_client_id UUID;
BEGIN
    -- Loop through invites that are marked accepted but have no corresponding client record
    FOR r_invite IN 
        SELECT i.* 
        FROM reseller_invites i
        LEFT JOIN app_users u ON u.email = i.invite_email
        LEFT JOIN companies c ON c.id = u.company_id
        WHERE i.status = 'ACCEPTED'
        AND NOT EXISTS (
            SELECT 1 FROM reseller_clients rc 
            WHERE rc.reseller_id = i.reseller_id 
            AND rc.client_company_id = c.id
        )
    LOOP
        -- Find the company ID for this user email
        SELECT company_id INTO v_client_id
        FROM app_users
        WHERE email = r_invite.invite_email
        LIMIT 1;

        IF v_client_id IS NOT NULL THEN
            -- Fix: Insert the missing relationship
            INSERT INTO reseller_clients (
                reseller_id,
                client_company_id,
                status,
                access_level,
                relationship_start_date
            ) VALUES (
                r_invite.reseller_id,
                v_client_id,
                'ACTIVE',
                'FULL',
                CURRENT_DATE
            )
            ON CONFLICT (reseller_id, client_company_id) DO NOTHING;
            
            RAISE NOTICE 'Fixed missing client link for invite: %', r_invite.invite_email;
        END IF;
    END LOOP;
END $$;

-- 2. Debug: List all invitations and their status to verify visibility
SELECT 
    i.invite_email, 
    i.status as invite_status, 
    c.name as reseller_name,
    CASE WHEN rc.id IS NOT NULL THEN 'LINKED' ELSE 'MISSING LINK' END as link_status
FROM reseller_invites i
JOIN companies c ON c.id = i.reseller_id
LEFT JOIN app_users u ON u.email = i.invite_email
LEFT JOIN reseller_clients rc ON rc.reseller_id = i.reseller_id AND rc.client_company_id = u.company_id;
