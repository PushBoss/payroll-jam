# Supabase Auth Configuration for Password Reset

## Issue: "Invalid or Expired Password Link"

This error occurs when the password reset token expires or the redirect URL isn't properly configured in Supabase.

## Solution: Configure Supabase Auth Settings

### Step 1: Access Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **Authentication** → **URL Configuration**

### Step 2: Add Redirect URLs
Add the following URLs to **Redirect URLs** (all variations):

```
https://www.payrolljam.com/?page=reset-password
https://payrolljam.com/?page=reset-password
http://localhost:5173/?page=reset-password
```

### Step 3: Configure Email Templates (Optional)
1. Navigate to **Authentication** → **Email Templates**
2. Select **Reset Password** template
3. Ensure the reset link uses: `{{ .ConfirmationURL }}`

### Step 4: Set Token Expiration
1. Navigate to **Authentication** → **Policies**
2. Check **Password Reset Token Expiry** (default: 1 hour)
3. Consider increasing to 24 hours if users report frequent expiry

### Step 5: Test the Flow

1. **Request Reset:**
   ```
   Go to https://www.payrolljam.com/?page=login
   Click "Forgot Password"
   Enter email
   ```

2. **Check Email:**
   - Look in inbox AND spam folder
   - Click the link within the expiry window
   - The URL should look like:
     ```
     https://www.payrolljam.com/?page=reset-password#access_token=...&type=recovery&...
     ```

3. **Monitor Console:**
   - Open browser DevTools (F12)
   - Watch for console logs showing token detection
   - Should see: "✅ Found recovery tokens, setting session..."

### Troubleshooting

#### Error: "Invalid or expired reset link"

**Possible Causes:**
1. ❌ Redirect URL not configured in Supabase
2. ❌ Token expired (user waited too long)
3. ❌ Link was already used
4. ❌ Email took too long to arrive

**Solutions:**
- Add all redirect URL variations to Supabase
- Increase token expiry time
- Request a fresh reset link
- Check spam folder for faster delivery

#### Error: "Error verifying reset link"

**Possible Causes:**
1. ❌ Supabase client not initialized
2. ❌ Network connectivity issues
3. ❌ Invalid token format

**Solutions:**
- Check browser console for detailed logs
- Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
- Try clearing browser cache and requesting new link

#### No Email Received

**Check:**
1. Email is in spam/junk folder
2. Email exists in your Supabase Auth users
3. SMTP is configured in Supabase (Production mode)
4. Check Supabase Auth logs for delivery status

### Environment Variables

Ensure these are set in your `.env` file:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Recent Improvements

✅ **Enhanced Token Handling:**
- Manual session setting with `setSession()`
- Better error detection from URL parameters
- Detailed console logging for debugging

✅ **User Feedback:**
- Clear error messages
- Automatic redirect to login after 3 seconds
- Visual loading states

## Testing Checklist

- [ ] Redirect URLs added to Supabase dashboard
- [ ] Password reset email received (check spam)
- [ ] Link opens reset password page
- [ ] Console shows "✅ Valid session found"
- [ ] New password successfully saved
- [ ] Redirect to login works
- [ ] Can log in with new password

## Support

If issues persist after following this guide:
1. Check browser console for detailed error logs
2. Check Supabase Auth logs in dashboard
3. Verify email template is using `{{ .ConfirmationURL }}`
4. Test with a fresh incognito window
