# Profile Feature Setup Guide

## 🎉 What's New
Users can now click on their name/avatar in the sidebar to access their profile page where they can:
- Upload and update their profile photo
- Edit their name, email, and phone number
- All changes are saved to Supabase backend

## 🚀 Setup Steps

### 1. Run Database Migration
You need to add two columns to your `app_users` table and create a storage bucket:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `arqbxlaudfbmiqvwwmnt`
3. Navigate to **SQL Editor**
4. Copy the contents of `db/migrations/add_profile_fields.sql`
5. Paste and click **Run**

### 2. Verify Storage Bucket
After running the migration, verify the `avatars` bucket was created:
1. In Supabase Dashboard, go to **Storage**
2. You should see an `avatars` bucket
3. It should be set to **Public** (for reading images)

### 3. Test the Feature
1. Start your dev server: `npm run dev`
2. Login to your account
3. Click on your name/avatar at the bottom of the sidebar
4. You should see the Profile page
5. Try uploading a profile photo (max 2MB)
6. Update your name or phone number
7. Click **Save Changes**

## ✅ Features Included

### Profile Page (`pages/Profile.tsx`)
- Image upload with preview
- Supports JPG, PNG, GIF (max 2MB)
- Form fields: Name, Email, Phone, Role (read-only)
- Real-time avatar update in sidebar
- Backend-driven: all changes saved to Supabase

### Sidebar Enhancement (`components/Layout.tsx`)
- Clickable user section at bottom of sidebar
- Shows profile photo if uploaded, otherwise initials
- Hover effect for better UX
- Navigates to `/profile` on click

### Type Updates (`types.ts`)
- Added `avatarUrl?: string` to User interface
- Added `phone?: string` to User interface

### Database Schema
- `app_users.avatar_url` - stores Supabase Storage public URL
- `app_users.phone` - stores user phone number
- `avatars` storage bucket - public read, authenticated write

## 🔐 Security
- Storage bucket uses Row Level Security (RLS)
- Users can only upload/update/delete their own avatars
- All avatars are publicly readable (for display across app)
- File size limited to 2MB client-side
- Only image files accepted

## 📝 Notes
- Avatar URLs are public Supabase Storage URLs
- Images are stored in `avatars/{userId}-{timestamp}.{ext}` format
- Old avatars are not automatically deleted (can be improved later)
- Phone number format is not enforced (can add validation later)
