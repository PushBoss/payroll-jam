-- Delete orphaned auth users so you can retry signup
-- These users were created in auth.users but failed to create app_users records due to RLS errors

DELETE FROM auth.users 
WHERE email IN ('pushtechja@gmail.com', 'aarongardiner6@gmail.com');

-- Verify they're deleted
SELECT email, id 
FROM auth.users 
WHERE email IN ('pushtechja@gmail.com', 'aarongardiner6@gmail.com');
