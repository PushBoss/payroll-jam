-- Create storage buckets for file uploads
-- Run this in Supabase SQL Editor
-- Note: Storage buckets in Supabase are PUBLIC by default when created via SQL
-- RLS policies are managed automatically by Supabase

-- Create documents bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create employee-files bucket (private - for profile photos, etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-files', 'employee-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create company-files bucket (public - for logos, etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-files', 'company-files', true)
ON CONFLICT (id) DO NOTHING;

-- Verify buckets were created
SELECT id, name, public, created_at
FROM storage.buckets
WHERE name IN ('documents', 'employee-files', 'company-files');
