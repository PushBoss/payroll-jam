-- ==========================================
-- FIX: ACCOUNT_MEMBERS UNIQUE CONSTRAINT
-- ==========================================

-- This fixes the "400 Bad Request" when upserting to account_members 
-- by ensuring a unique constraint exists for (account_id, email).

DO $$ 
BEGIN
    -- 1. Check if the constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'account_members_account_id_email_key'
    ) THEN
        -- 2. Add the unique constraint
        -- We use email because user_id might change or be null during the invite flow, 
        -- but the combination of (Company + Email) should always be unique.
        ALTER TABLE public.account_members 
        ADD CONSTRAINT account_members_account_id_email_key UNIQUE (account_id, email);
        
        RAISE NOTICE 'Constraint account_members_account_id_email_key created.';
    ELSE
        RAISE NOTICE 'Constraint account_members_account_id_email_key already exists.';
    END IF;
END $$;

-- 3. Verify constraints on account_members
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'public.account_members'::regclass;
