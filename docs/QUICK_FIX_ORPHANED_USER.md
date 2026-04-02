# Quick Fix: Orphaned User Profile

## Problem
User signed up and paid, but profile wasn't created in `app_users` table. User exists in Supabase Auth but can't login.

## Symptoms
```
❌ Login failed: Error: User profile not found in database
User authenticated but no profile found
```

## Quick Fix Steps

### Option 1: SQL Fix (Recommended - 2 minutes)

1. **Go to Supabase Dashboard**
   - Navigate to: SQL Editor

2. **Find the Orphaned User**
   ```sql
   SELECT 
     au.id,
     au.email,
     au.created_at
   FROM 
     auth.users au
   LEFT JOIN 
     app_users apu ON au.id = apu.id
   WHERE 
     apu.id IS NULL
   ORDER BY au.created_at DESC
   LIMIT 5;
   ```

3. **Find the User's Company**
   ```sql
   SELECT 
     c.id as company_id,
     c.name as company_name,
     c.email,
     c.plan,
     c.created_at
   FROM 
     companies c
   LEFT JOIN 
     app_users apu ON c.id = apu.company_id
   WHERE 
     apu.id IS NULL
     AND c.created_at > NOW() - INTERVAL '24 hours'
   ORDER BY 
     c.created_at DESC;
   ```

4. **Create the Missing Profile**
   Replace `USER_ID`, `EMAIL`, `NAME`, and `COMPANY_ID` with actual values:
   
   ```sql
   INSERT INTO app_users (
     id,
     email,
     name,
     role,
     company_id,
     is_onboarded,
     preferences
   ) VALUES (
     'USER_ID_FROM_STEP_2',
     'user@example.com',
     'User Name',
     'OWNER',
     'COMPANY_ID_FROM_STEP_3',
     FALSE,
     '{}'::jsonb
   )
   ON CONFLICT (id) DO UPDATE SET
     company_id = EXCLUDED.company_id,
     email = EXCLUDED.email;
   ```

5. **Verify**
   ```sql
   SELECT 
     apu.id,
     apu.email,
     apu.role,
     apu.company_id,
     c.name as company_name
   FROM 
     app_users apu
   JOIN 
     companies c ON apu.company_id = c.id
   WHERE 
     apu.email = 'user@example.com';
   ```

### Option 2: Delete and Re-signup (5 minutes)

1. **Delete the orphaned auth user**
   ```sql
   -- Get the user ID first
   SELECT id, email FROM auth.users WHERE email = 'user@example.com';
   
   -- Delete from auth (this will cascade)
   DELETE FROM auth.users WHERE email = 'user@example.com';
   ```

2. **Delete the company** (if it was created)
   ```sql
   DELETE FROM companies WHERE email = 'user@example.com';
   ```

3. **User can now re-signup** with the same email

## Prevention (Already Fixed in Code)

The latest code includes:
- ✅ Better error handling during profile creation
- ✅ Cleanup of auth users if profile creation fails
- ✅ Detailed logging to catch failures
- ✅ All signups redirect to login with email verification

## For Future Signups

After the new code is deployed (commit 87c8386), the flow is:
1. User signs up → Auth user + Company + Profile all created atomically
2. If profile creation fails → Auth user is cleaned up
3. User redirected to login page with email verification message
4. User must verify email before logging in
5. Login checks for profile before allowing access

## Deploying the Fix

To deploy the new code with the fixes:

```bash
cd /Users/aarongardiner/Desktop/payroll-jam
git pull origin main  # Get latest changes (already done)
npm run build         # Build
# Deploy to your hosting (Vercel/Netlify/etc)
```

## Testing the Fix

After deployment:
1. Try signing up a new test account
2. Check console logs for:
   ```
   📝 Creating user profile: { id: ..., email: ..., companyId: ... }
   ✅ User profile saved to app_users table
   ✅ Signup completed successfully
   ```
3. Should redirect to login with toast message
4. After email verification, should be able to login

## SQL Script Files

- `fix_orphaned_user.sql` - Use this to manually fix existing orphaned users
- Run in Supabase SQL Editor

---

**Status:** This is a temporary fix for the current orphaned user. New signups will work correctly once the latest code is deployed.
