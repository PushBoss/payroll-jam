# Profile Feature Migration

This migration adds support for user profile photos and phone numbers.

## What it does:
1. Adds `avatar_url` column to `app_users` table
2. Adds `phone` column to `app_users` table  
3. Creates `avatars` storage bucket (public read access)
4. Sets up Row Level Security policies for avatar uploads

## How to run:

### Option 1: Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor
4. Copy and paste the contents of `add_profile_fields.sql`
5. Click "Run"

### Option 2: Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push
```

## Verification:
After running the migration, verify:
1. `app_users` table has `avatar_url` and `phone` columns
2. Storage bucket `avatars` exists and is public
3. Storage policies are in place

## Rollback (if needed):
```sql
ALTER TABLE app_users 
DROP COLUMN IF EXISTS avatar_url,
DROP COLUMN IF EXISTS phone;

DELETE FROM storage.buckets WHERE id = 'avatars';
```
