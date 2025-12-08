-- Add unique constraint on email to prevent duplicate signups
-- Run this in Supabase SQL Editor

-- Add unique constraint to app_users email
ALTER TABLE app_users ADD CONSTRAINT app_users_email_unique UNIQUE (email);

-- Verify the constraint was added
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'app_users'::regclass 
AND conname = 'app_users_email_unique';
