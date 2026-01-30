-- 1. Create the 'knowledgebase' bucket
-- If this fails because bucket exists, ignore it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledgebase', 'knowledgebase', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for knowledgebase
-- Only admins/service role should manage this

-- Drop existing policies if they exist to avoid errors on re-run
DROP POLICY IF EXISTS "Service role can manage knowledgebase" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage knowledgebase" ON storage.objects;

-- Allow service role to do everything
CREATE POLICY "Service role can manage knowledgebase" 
ON storage.objects FOR ALL 
TO service_role 
USING (bucket_id = 'knowledgebase');

-- Allow authenticated admins to view/manage
CREATE POLICY "Admins can manage knowledgebase" 
ON storage.objects FOR ALL 
TO authenticated 
USING (
  bucket_id = 'knowledgebase' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE app_users.id = auth.uid()
    AND app_users.role IN ('OWNER', 'ADMIN')
  )
)
WITH CHECK (
  bucket_id = 'knowledgebase' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE app_users.id = auth.uid()
    AND app_users.role IN ('OWNER', 'ADMIN')
  )
);
