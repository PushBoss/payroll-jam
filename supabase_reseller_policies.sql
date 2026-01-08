-- =====================================================
-- FIX RESELLER RLS POLICIES
-- =====================================================
-- Run this in the Supabase SQL Editor to ensure future invites work automatically.

-- 1. Enable RLS on the table (Safe to run even if already enabled)
ALTER TABLE reseller_clients ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts/errors
DROP POLICY IF EXISTS "Allow authenticated users to insert reseller_clients" ON reseller_clients;
DROP POLICY IF EXISTS "Allow particular reseller to view their clients" ON reseller_clients;
DROP POLICY IF EXISTS "Allow clients to view their reseller link" ON reseller_clients;

-- 3. Create Policy: Allow Clients to accept invites (Insert Link)
-- This allows a user to insert a link ONLY if the client_company_id matches their own company.
CREATE POLICY "Allow authenticated users to insert reseller_clients" 
ON reseller_clients FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM app_users WHERE company_id = client_company_id
  )
);

-- 4. Create Policy: Allow Resellers to view their portfolio
-- This allows you (the reseller) to see the rows in your dashboard
CREATE POLICY "Allow resellers to view their clients" 
ON reseller_clients FOR SELECT 
USING (
  auth.uid() IN (
    SELECT id FROM app_users WHERE company_id = reseller_id
  )
);

-- 5. Create Policy: Allow Clients to view their own link
-- (Optional but good for transparency)
CREATE POLICY "Allow clients to view their reseller link" 
ON reseller_clients FOR SELECT 
USING (
  auth.uid() IN (
    SELECT id FROM app_users WHERE company_id = client_company_id
  )
);
