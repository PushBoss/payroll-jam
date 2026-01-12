-- FIX MISSING RESELLER CLIENT LINKS
-- Creates reseller_clients rows for accepted invites where the link failed.
-- Also syncs companies.reseller_id for those clients.

CREATE TEMP TABLE tmp_accepted_invites AS
SELECT ri.reseller_id,
       au.company_id,
       ri.invite_email
FROM public.reseller_invites ri
JOIN public.app_users au ON lower(au.email) = lower(ri.invite_email)
WHERE ri.status = 'ACCEPTED'
  AND au.company_id IS NOT NULL;

INSERT INTO public.reseller_clients (
    reseller_id,
    client_company_id,
    status,
    access_level,
    relationship_start_date,
    created_at,
    updated_at
)
SELECT tai.reseller_id,
       tai.company_id,
       'ACTIVE',
       'FULL',
       CURRENT_DATE,
       NOW(),
       NOW()
FROM tmp_accepted_invites tai
WHERE NOT EXISTS (
    SELECT 1 FROM public.reseller_clients rc
    WHERE rc.reseller_id = tai.reseller_id
      AND rc.client_company_id = tai.company_id
);

UPDATE public.companies c
SET reseller_id = tai.reseller_id
FROM tmp_accepted_invites tai
WHERE c.id = tai.company_id
  AND (c.reseller_id IS DISTINCT FROM tai.reseller_id OR c.reseller_id IS NULL);

DROP TABLE tmp_accepted_invites;
