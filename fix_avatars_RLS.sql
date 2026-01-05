-- RUN THIS IN THE SUPABASE SQL EDITOR
-- NOTE: If you still get a permission error, please create the bucket and policies 
-- manually in the Supabase UI (Storage > Buckets > avatars > Policies).

-- 1. Ensure the 'avatars' bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Create/Update policies for the 'avatars' bucket
-- (We removed the 'ALTER TABLE' command which was causing permission issues)

-- Policy 1: Allow public read access to the avatars bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Policy 2: Allow authenticated users to upload files to the avatars bucket
DROP POLICY IF EXISTS "Authenticated Insert" ON storage.objects;
CREATE POLICY "Authenticated Insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Policy 3: Allow authenticated users to update files in the avatars bucket
-- Required for 'upsert: true' to work
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

-- Policy 4: Allow authenticated users to delete files in the avatars bucket
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- Verify the bucket configuration
SELECT id, name, public FROM storage.buckets WHERE id = 'avatars';
