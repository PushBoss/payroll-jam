
-- REPAIR SCRIPT: Manually link 'info@pushtechsolutions.com' to the reseller
-- Run this in your Supabase SQL Editor

DO $$
DECLARE
    v_invite RECORD;
    v_client_company_id UUID;
    v_target_email TEXT := 'info@pushtechsolutions.com';
BEGIN
    -- 1. Find the PENDING invite for this email
    SELECT * INTO v_invite
    FROM reseller_invites
    WHERE invite_email = v_target_email
      AND status = 'PENDING'
    LIMIT 1;

    IF v_invite IS NULL THEN
        RAISE NOTICE 'No pending invite found for %', v_target_email;
        RETURN;
    END IF;

    -- 2. Find the Company ID associated with this email
    -- (The user created a company when they signed up)
    SELECT id INTO v_client_company_id
    FROM companies
    WHERE email = v_target_email
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_client_company_id IS NULL THEN
        RAISE NOTICE 'No company found for email %. User might not have completed signup.', v_target_email;
        RETURN;
    END IF;

    -- 3. Create the Reseller-Client Link
    INSERT INTO reseller_clients (reseller_id, client_company_id, status, access_level)
    VALUES (v_invite.reseller_id, v_client_company_id, 'ACTIVE', 'FULL')
    ON CONFLICT (reseller_id, client_company_id) DO UPDATE SET status = 'ACTIVE';

    -- 4. Mark Invite as Accepted
    UPDATE reseller_invites
    SET status = 'ACCEPTED',
        accepted_at = NOW()
    WHERE id = v_invite.id;

    RAISE NOTICE 'SUCCESS: Linked % (Company ID: %) to Reseller (ID: %)', v_target_email, v_client_company_id, v_invite.reseller_id;

END $$;
