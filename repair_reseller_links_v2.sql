-- Fix Infinite Recursion and Repair Missing Reseller Links

-- 1. DROP the recursive policy on app_users
-- This policy: "Company admins can view company users" queries the `companies` table.
-- The query on `companies` table invokes its own policy, which checks `app_users` (via `get_current_user_company_id` or other logic).
-- This creates the loop: app_users -> companies -> app_users.
DROP POLICY IF EXISTS "Company admins can view company users" ON public.app_users;

-- 2. Create a NON-RECURSIVE version using the secure function or simpler logic
-- Instead of joining companies, we rely on the fact that if you are in the same company, we can see you.
-- BUT to do that safely without joining `companies`, we can use `auth.jwt()` or the secure function.
-- HOWEVER, using `get_current_user_company_id()` inside `app_users` policy might still be risky if that function is not strictly SECURITY DEFINER (which it is).

-- Let's try a safer approach: "Users can view other users in the same company"
-- We use a simpler condition that doesn't trigger a SELECT on companies if possible.
-- If we MUST select on companies, we must ensure companies policy doesn't select on app_users for THIS specific case.

-- STRATEGY: 
-- 1. Making `get_current_user_company_id` extremely robust and cache-able.
-- 2. Fixing `app_users` to NOT query `companies` for simple visibility if possible.

CREATE POLICY "Company admins can view company users" ON public.app_users
  FOR SELECT
  USING (
    -- You can see users who share your company_id
    -- We use the function to get YOUR company_id without triggering RLS on app_users (because the function has SECURITY DEFINER)
    company_id = get_current_user_company_id()
  );

-- 3. FIX EMPLOYEES RLS (which was also erroring)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON public.employees;

CREATE POLICY "employees_select" ON public.employees
  FOR SELECT
  USING (
    -- Owner/Admin of the company can see employees
    company_id = get_current_user_company_id()
    -- OR Employee can see themselves (if they are linked to auth user, assuming email match or user_id match)
    -- OR email = (SELECT email FROM auth.users WHERE id = auth.uid()) 
  );


-- 4. REPAIR SCRIPT: Fix missing Reseller Client Links
-- This finds accepted invites that led to a user/company creation but failed to create the link in reseller_clients
DO $$
DECLARE
    r_invite RECORD;
    v_client_id UUID;
    v_existing_link UUID;
BEGIN
    -- Loop through all accepted invites
    FOR r_invite IN 
        SELECT * FROM reseller_invites WHERE status = 'ACCEPTED'
    LOOP
        -- Find the company ID associated with the invite email
        SELECT company_id INTO v_client_id
        FROM app_users
        WHERE email = r_invite.invite_email
        LIMIT 1;

        -- If we found a company for this user
        IF v_client_id IS NOT NULL THEN
            -- Check if the link already exists
            SELECT client_company_id INTO v_existing_link
            FROM reseller_clients
            WHERE reseller_id = r_invite.reseller_id
            AND client_company_id = v_client_id;

            -- If link is missing, create it
            IF v_existing_link IS NULL THEN
                INSERT INTO reseller_clients (
                    reseller_id,
                    client_company_id,
                    status,
                    access_level,
                    relationship_start_date,
                    created_at,
                    updated_at
                ) VALUES (
                    r_invite.reseller_id,
                    v_client_id,
                    'ACTIVE',
                    'FULL',
                    CURRENT_DATE,
                    NOW(),
                    NOW()
                );
                RAISE NOTICE 'Fixed missing link for invite: % -> Company: %', r_invite.invite_email, v_client_id;
            END IF;
        END IF;
    END LOOP;
END $$;
