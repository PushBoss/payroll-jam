-- ========================================================
-- SCRIPT: CONFIRM DIRECT DEPOSIT PAYMENTS
-- ========================================================
-- Use this script to manually activate accounts that chose 
-- 'Direct Deposit' and are currently in PENDING_PAYMENT status.

-- 1. LIST ALL COMPANIES PENDING PAYMENT
-- Run this first to see who needs activation
SELECT 
    id, 
    name, 
    email, 
    plan, 
    billing_cycle, 
    created_at
FROM public.companies
WHERE status = 'PENDING_PAYMENT'
ORDER BY created_at DESC;


-- 2. APPROVE A SPECIFIC COMPANY BY ID
-- Copy the ID from the list above and paste it below
/*
UPDATE public.companies
SET status = 'ACTIVE'
WHERE id = 'PASTE_COMPANY_ID_HERE'
AND status = 'PENDING_PAYMENT';
*/


-- 3. APPROVE A SPECIFIC COMPANY BY NAME
-- Use this if you know the exact name
/*
UPDATE public.companies
SET status = 'ACTIVE'
WHERE name = 'Aaron gardiner''s Company'
AND status = 'PENDING_PAYMENT';
*/


-- 4. APPROVE ALL PENDING PAYMENTS (BULK)
-- Uncomment and run this to activate everyone at once
/*
UPDATE public.companies
SET status = 'ACTIVE'
WHERE status = 'PENDING_PAYMENT';
*/


-- 5. VERIFY RESULTS
-- Run this to check the current status of the companies
SELECT id, name, status, plan 
FROM public.companies 
WHERE status IN ('ACTIVE', 'PENDING_PAYMENT')
ORDER BY status ASC, name ASC;
