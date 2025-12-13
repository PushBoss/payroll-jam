-- Find the company ID for jarenegades@gmail.com
-- Run this first to get the correct company_id (UUID)

SELECT 
  c.id as company_id,
  c.name as company_name,
  c.email,
  c.plan,
  c.status,
  c.created_at
FROM 
  companies c
WHERE 
  c.name = 'Chad Turner''s Company'
  OR c.email = 'jarenegades@gmail.com'
  OR c.created_at > NOW() - INTERVAL '48 hours'
ORDER BY 
  c.created_at DESC
LIMIT 10;
