-- DEBUG: FIND AARON AND CLIENT
SELECT id, email, role, company_id 
FROM public.app_users 
WHERE email = 'info@pushtechsolutions.com' 
   OR email = 'aarongardiner6@gmail.com';

SELECT id, name, owner_id, reseller_id 
FROM public.companies 
WHERE name LIKE '%Aaron%' 
   OR name LIKE '%Michael%';

-- CHECK MEMBERSHIPS FOR AARON
SELECT am.*, c.name as company_name
FROM public.account_members am
JOIN public.companies c ON c.id = am.account_id
WHERE am.email = 'info@pushtechsolutions.com';
