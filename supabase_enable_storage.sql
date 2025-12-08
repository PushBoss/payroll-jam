-- Create storage buckets for file uploads
-- Run this in Supabase SQL Editor

-- Create documents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create employee-files bucket (for profile photos, etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-files', 'employee-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create company-files bucket (for logos, etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-files', 'company-files', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage buckets
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create storage policies for documents bucket
CREATE POLICY "Allow public upload to documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow public read from documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');

CREATE POLICY "Allow public update to documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'documents');

CREATE POLICY "Allow public delete from documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'documents');

-- Create storage policies for employee-files bucket
CREATE POLICY "Allow public upload to employee-files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'employee-files');

CREATE POLICY "Allow public read from employee-files"
ON storage.objects FOR SELECT
USING (bucket_id = 'employee-files');

CREATE POLICY "Allow public update to employee-files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'employee-files');

CREATE POLICY "Allow public delete from employee-files"
ON storage.objects FOR DELETE
USING (bucket_id = 'employee-files');

-- Create storage policies for company-files bucket
CREATE POLICY "Allow public upload to company-files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'company-files');

CREATE POLICY "Allow public read from company-files"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-files');

CREATE POLICY "Allow public update to company-files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'company-files');

CREATE POLICY "Allow public delete from company-files"
ON storage.objects FOR DELETE
USING (bucket_id = 'company-files');

-- Verify buckets were created
SELECT id, name, public, created_at
FROM storage.buckets
WHERE name IN ('documents', 'employee-files', 'company-files');

-- Verify storage policies
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;
