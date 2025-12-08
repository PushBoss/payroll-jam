-- Fix foreign key constraint issue by making company_id nullable
-- and removing NOT NULL constraint temporarily
-- Run this in Supabase SQL Editor

-- Option 1: Make company_id nullable (allows user creation before company)
ALTER TABLE app_users ALTER COLUMN company_id DROP NOT NULL;

-- Option 2: Drop the foreign key constraint entirely (simpler but less data integrity)
-- ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_company_id_fkey;

-- Check the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'app_users' 
AND column_name = 'company_id';
