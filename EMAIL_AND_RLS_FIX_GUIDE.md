# Email Verification & RLS Configuration Guide

## Problem Summary
1. Users not receiving verification emails after signup
2. User search failing with 401/404 errors (RLS policy issues)
3. Account creation failing silently (non-fatal)

## Solution

### Part 1: Fix RLS Policies

Run the SQL migration: `supabase_fix_accounts_rls.sql`

This will:
- Create `accounts` table if missing
- Enable RLS on `accounts` and `app_users` tables
- Add proper RLS policies allowing:
  - Users to view/edit their own data
  - Email search for user invitations
  - Service role to bypass RLS for backend operations

**Steps:**
1. Go to Supabase Dashboard → SQL Editor
2. Create new query
3. Copy contents of `supabase_fix_accounts_rls.sql`
4. Execute

### Part 2: Enable Email Verification in Supabase

**Step-by-step:**

1. **Enable Email Auth:**
   - Go to Supabase Dashboard
   - Click "Authentication" → "Providers"
   - Find "Email" provider
   - Click "Enable"
   - Set "Confirm email" toggle to **ON**

2. **Configure SMTP (for production emails):**
   - Click "Authentication" → "Email Templates"
   - Verify you see "Confirmation" email template
   - Click "Settings" → "Email Configuration"
   - Choose SMTP provider:
     - **Option A:** Use SendGrid (recommended)
       - Create SendGrid account
       - Get API key
       - Enter in Supabase: Host: `smtp.sendgrid.net`, Port: `587`
       - Username: `apikey`
       - Password: `<SendGrid API key>`
     - **Option B:** Use AWS SES, Brevo, or other SMTP
     - **Option C:** Use Supabase email (limited - 3 emails/hour)

3. **Verify Sender Email:**
   - Must be the domain sending emails
   - Example: `noreply@payrolljam.com`
   - For SendGrid: Add sender domain and verify
   - For AWS SES: Verify sender address

4. **Test Email:**
   - Create test user account
   - Check spam folder
   - Check logs: Supabase Dashboard → Logs → Auth

### Part 3: Troubleshoot Specific Issues

**Emails going to spam:**
- Use proper sender domain (not `noreply@gmail.com`)
- Add SPF/DKIM records for your domain
- Ensure SMTP credentials are correct

**Still not receiving emails:**
- Check Supabase logs for errors
- Verify SMTP credentials in Email Configuration
- Ensure confirmation email template is enabled
- Try resending verification email

**User search still failing:**
- Confirm SQL migration was executed
- Check RLS policies: Supabase Dashboard → SQL Editor
- Run: `SELECT * FROM pg_policies WHERE tablename = 'app_users';`
- Should show `app_users_search_by_email` policy

### Part 4: Account Creation via Trigger (Optional)

For production, automatically create `accounts` record on user signup:

```sql
-- Create function to auto-create account on signup
CREATE OR REPLACE FUNCTION create_account_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (owner_id, email, company_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'companyName', NEW.email || '''s Company'))
  ON CONFLICT (owner_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS trigger_create_account_on_signup ON auth.users;
CREATE TRIGGER trigger_create_account_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_account_on_signup();
```

## Testing Checklist

- [ ] Run `supabase_fix_accounts_rls.sql` migration
- [ ] Enable email confirmation in Supabase Auth
- [ ] Configure SMTP in Supabase Email Settings
- [ ] Create test account and verify email received
- [ ] Search for user by email in invite UI (should work)
- [ ] Create invitation and verify accepted (should work)
- [ ] Upgrade to Reseller and verify $5000 + per-employee fees charged

## RLS Policy Reference

**accounts table:**
- `users_view_own_account`: Users can read their own account
- `users_insert_own_account`: Users can create their own account
- `users_update_own_account`: Users can update their own account

**app_users table:**
- `app_users_view_own`: Users can read their own profile
- `app_users_search_by_email`: Anyone can search users by email (for invites)
- `app_users_insert_own`: Users can create their own profile
- `app_users_update_own`: Users can update their own profile

**Service Role:** Bypasses all RLS (used by backend)

## Support

If issues persist:
1. Check Supabase logs: Auth errors, RLS violations
2. Verify SMTP credentials are correct
3. Ensure redirect URL matches Supabase allowed URLs
4. Check browser console for API errors
