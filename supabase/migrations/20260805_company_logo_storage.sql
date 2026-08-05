-- Store one public, reusable company logo per company. The logo URL remains in
-- companies.settings.logoUrl so existing document and portal rendering flows
-- continue to work without a schema change.

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Company logos are publicly readable" ON storage.objects;
CREATE POLICY "Company logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "Company admins upload their logos" ON storage.objects;
CREATE POLICY "Company admins upload their logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id::text = (storage.foldername(name))[1]
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER')
    )
  );

DROP POLICY IF EXISTS "Company admins update their logos" ON storage.objects;
CREATE POLICY "Company admins update their logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id::text = (storage.foldername(name))[1]
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER')
    )
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id::text = (storage.foldername(name))[1]
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER')
    )
  );

DROP POLICY IF EXISTS "Company admins delete their logos" ON storage.objects;
CREATE POLICY "Company admins delete their logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id::text = (storage.foldername(name))[1]
        AND u.role IN ('OWNER', 'ADMIN', 'MANAGER', 'RESELLER')
    )
  );
