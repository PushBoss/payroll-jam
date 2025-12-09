-- Check for orphaned auth users (users in auth.users but not in app_users)
-- This query will show you emails that exist in auth but failed to create app_users records

SELECT 
  au.email,
  au.id as auth_id,
  au.created_at as auth_created,
  u.id as app_user_id
FROM auth.users au
LEFT JOIN app_users u ON au.id = u.auth_user_id
WHERE u.id IS NULL
ORDER BY au.created_at DESC;

-- If you want to delete these orphaned auth users to retry signup:
-- (Uncomment the lines below and replace the email with the actual email)

-- DELETE FROM auth.users 
-- WHERE email = 'pushtechhja@gmail.com';
