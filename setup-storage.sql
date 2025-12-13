-- Create the documents bucket (run this in Supabase SQL Editor if bucket doesn't exist)
-- Or create it via the UI: Storage > New Bucket > Name: "documents", Public: true

-- Storage policies for employee document uploads
-- Run these in: Storage > Policies > New Policy (or SQL Editor)

-- Policy 1: Allow authenticated users to upload to employee-verification folder
CREATE POLICY "authenticated_employee_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'employee-verification'
);

-- Policy 2: Allow users to read files they uploaded
CREATE POLICY "authenticated_employee_read_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Policy 3: Allow employers/admins to read all employee documents
CREATE POLICY "employer_read_employee_docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'employee-verification' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE app_users.id = auth.uid()
    AND app_users.role IN ('OWNER', 'ADMIN', 'MANAGER')
  )
);
