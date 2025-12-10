#!/bin/bash

# Profile Feature Migration Script
# This script helps you apply the database migration for the profile feature

echo "🚀 Profile Feature Migration"
echo "============================"
echo ""
echo "This will add avatar_url and phone columns to app_users table"
echo "and create the avatars storage bucket in Supabase."
echo ""
echo "⚠️  Make sure you have your Supabase credentials ready!"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found"
    echo "Please create .env.local with your Supabase credentials"
    exit 1
fi

# Extract Supabase URL and key
SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local | cut -d '=' -f2 | tr -d '"' | tr -d ' ')
SUPABASE_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d '=' -f2 | tr -d '"' | tr -d ' ')

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "❌ Error: Could not find Supabase credentials in .env.local"
    exit 1
fi

echo "✅ Found Supabase credentials"
echo ""
echo "📋 Migration will:"
echo "   1. Add avatar_url column to app_users"
echo "   2. Add phone column to app_users"
echo "   3. Create avatars storage bucket"
echo "   4. Set up storage policies"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration cancelled"
    exit 1
fi

echo ""
echo "📝 Please run the migration manually:"
echo ""
echo "1. Go to: https://supabase.com/dashboard"
echo "2. Select your project"
echo "3. Navigate to SQL Editor"
echo "4. Copy and paste the contents of: db/migrations/add_profile_fields.sql"
echo "5. Click Run"
echo ""
echo "📄 Migration file location: db/migrations/add_profile_fields.sql"
echo ""
echo "✅ After running, test the profile feature by:"
echo "   - npm run dev"
echo "   - Login and click your name in the sidebar"
echo "   - Upload a profile photo"
echo ""
