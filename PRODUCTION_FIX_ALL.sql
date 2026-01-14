-- ==========================================
-- PRODUCTION FIX: NORMALIZE CONSTRAINTS & SYNC
-- ==========================================

-- 1. FIX ACCOUNT_MEMBERS SCHEMA
DO $$ 
BEGIN
    -- Ensure 'email' column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_members' AND column_name = 'email') THEN
        ALTER TABLE public.account_members ADD COLUMN email VARCHAR(255);
    END IF;

    -- Convert role to text to bypass restrictive enums
    -- This handles the "invalid input value for enum" error.
    ALTER TABLE public.account_members ALTER COLUMN role TYPE TEXT USING role::TEXT;
    
    -- Drop old restrictive constraints
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_role_check;
    ALTER TABLE public.account_members DROP CONSTRAINT IF EXISTS account_members_account_id_user_id_key;

    -- Add the correct constraint for the app's invitation/sync logic
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_account_id_email_key') THEN
        ALTER TABLE public.account_members ADD CONSTRAINT account_members_account_id_email_key UNIQUE (account_id, email);
    END IF;
    
    RAISE NOTICE 'account_members schema normalized.';
END $$;


-- 2. BULK REPAIR RESELLER LINKS
-- If a user is an 'owner' of a company and they are also a 'RESELLER' in app_users,
-- then their company should be marked as a reseller company if not already.
-- And any company they are a 'manager' of should be in their reseller_clients.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT u.id as user_id, u.email, u.company_id as reseller_company_id, am.account_id as client_company_id, am.role
        FROM public.app_users u
        JOIN public.account_members am ON am.user_id = u.id
        WHERE u.role IN ('RESELLER', 'Reseller')
    ) LOOP
        -- If this is their own company, ensure they are owner
        IF r.reseller_company_id = r.client_company_id THEN
            -- Already handled by role owner usually
            CONTINUE;
        END IF;

        -- Link to portfolio if they are manager of another company
        IF r.role::TEXT IN ('MANAGER', 'manager', 'ADMIN', 'admin') THEN
            INSERT INTO public.reseller_clients (reseller_id, client_company_id, status, access_level)
            VALUES (r.reseller_company_id, r.client_company_id, 'ACTIVE', 'FULL')
            ON CONFLICT (reseller_id, client_company_id) DO NOTHING;

            UPDATE public.companies SET reseller_id = r.reseller_company_id WHERE id = r.client_company_id;
        END IF;
    END LOOP;
END $$;


-- 3. FIX AUDIT LOGS RLS (Optional - to stop the 403 noise)
-- Allow authenticated users to insert audit logs for their own company
DROP POLICY IF EXISTS "Users can insert own company audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert own company audit logs" ON public.audit_logs
FOR INSERT WITH CHECK (
    company_id IN (
        SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
    )
);


-- 4. VERIFY RESELLERS
SELECT 
    c.name as reseller_name, 
    u.email as reseller_email,
    (SELECT count(*) FROM public.reseller_clients rc WHERE rc.reseller_id = c.id) as client_count
FROM public.companies c
JOIN public.app_users u ON u.company_id = c.id
WHERE u.role IN ('RESELLER', 'Reseller');
