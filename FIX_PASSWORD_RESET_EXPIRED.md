# Fix: Password Reset Link Shows "Expired" After 1 Minute

## 🔍 Problem
User requests password reset, receives email, clicks link within 1 minute, but gets "Invalid or expired reset link" error.

## 🎯 Root Causes

### 1. **Redirect URL Mismatch** (Most Common)
The redirect URL in your Supabase dashboard doesn't match the one in the code.

### 2. **Token Expiry Too Short**
Supabase password reset token expiry is set too low.

### 3. **Site URL Not Set**
Supabase doesn't know your production domain.

---

## ✅ Solution Steps

### Step 1: Check Supabase Auth Settings

Go to: **Supabase Dashboard → Authentication → URL Configuration**

#### **A. Site URL**
Set this to your production domain:
```
https://www.payrolljam.com
```
or
```
https://payrolljam.com
```

**Important:** No trailing slash!

#### **B. Redirect URLs**
Add BOTH of these to the allowed list:
```
https://www.payrolljam.com/*
https://www.payrolljam.com/?page=reset-password
https://payrolljam.com/*
https://payrolljam.com/?page=reset-password
http://localhost:5173/*
http://localhost:5173/?page=reset-password
```

**Why both?**
- `/*` - Wildcard for all pages
- `/?page=reset-password` - Specific reset page

### Step 2: Check Email Template

Go to: **Supabase Dashboard → Authentication → Email Templates → Reset Password**

Make sure the template uses:
```html
<a href="{{ .ConfirmationURL }}">Reset Password</a>
```

**Current code sends:**
```typescript
redirectTo: `${window.location.origin}/?page=reset-password`
```

This matches the URL configuration above.

### Step 3: Increase Token Expiry

Go to: **Supabase Dashboard → Authentication → Policies**

Look for: **Password Recovery Token Expiry**

**Recommended Setting:**
- Default: 3600 seconds (1 hour) ✅
- Minimum: 600 seconds (10 minutes)
- If less than 600: Increase it!

### Step 4: Verify Email Delivery

The link might not be expired - the user might be clicking an old link!

**Check:**
1. User's email inbox for multiple reset emails
2. Spam/junk folder
3. Timestamp of the email vs. when they click

---

## 🧪 Test the Fix

### 1. **Request Password Reset**
```
1. Go to login page
2. Click "Forgot Password"
3. Enter email
4. Submit
```

### 2. **Check Console Logs**
When clicking the reset link, you should see:
```
🔍 Checking password reset session...
Current URL: https://www.payrolljam.com/?page=reset-password#access_token=...
Hash: #access_token=...&type=recovery&...
✅ Found recovery tokens, setting session...
✅ Session set successfully
✅ Valid session found
```

### 3. **If You See Errors:**

**Error: "access_denied"**
```
Hash params: { error: 'access_denied', errorDescription: 'Email link is invalid or has expired' }
```
→ **Fix:** Check redirect URLs in Step 1

**Error: "No valid session found"**
```
❌ No valid session found
```
→ **Fix:** Check token expiry in Step 3

**Error: Different URL in console**
```
Current URL: https://payrolljam.com/?page=login
```
→ User clicked old link or was redirected. Have them request a new reset.

---

## 🔧 Quick Debug Commands

### Check Current Supabase Session
Open browser console on reset password page:
```javascript
// Check if session exists
const { data } = await supabase.auth.getSession();
console.log('Session:', data.session);

// Check hash parameters
const hash = window.location.hash.substring(1);
const params = new URLSearchParams(hash);
console.log('Access Token:', params.get('access_token'));
console.log('Type:', params.get('type'));
console.log('Error:', params.get('error'));
```

---

## 📋 Checklist

Before testing again, verify:

- [ ] Site URL set in Supabase (e.g., `https://www.payrolljam.com`)
- [ ] Redirect URLs include `https://www.payrolljam.com/*`
- [ ] Redirect URLs include `https://www.payrolljam.com/?page=reset-password`
- [ ] Both `www` and non-`www` versions added (if applicable)
- [ ] Token expiry ≥ 600 seconds (10 minutes)
- [ ] Email template uses `{{ .ConfirmationURL }}`
- [ ] User requesting NEW reset (not using old link)
- [ ] Checking correct inbox (not old emails)

---

## 🚨 Common Mistakes

### ❌ Wrong: Site URL with trailing slash
```
https://www.payrolljam.com/
```

### ✅ Correct: No trailing slash
```
https://www.payrolljam.com
```

### ❌ Wrong: Missing www in redirects
```
Only: https://payrolljam.com/*
```

### ✅ Correct: Both versions
```
https://www.payrolljam.com/*
https://payrolljam.com/*
```

### ❌ Wrong: Using query string in template
```html
<a href="{{ .SiteURL }}?reset_token={{ .Token }}">
```

### ✅ Correct: Using confirmation URL
```html
<a href="{{ .ConfirmationURL }}">
```

---

## 🎯 Expected Flow

1. **User clicks "Forgot Password"** → Enters email
2. **Backend sends email** with URL: `https://www.payrolljam.com/?page=reset-password#access_token=abc123&type=recovery&refresh_token=xyz789`
3. **User clicks link** → Opens reset password page
4. **Page extracts tokens** from hash (`#access_token=...`)
5. **Page calls `setSession()`** with tokens
6. **Session validated** → Form shown
7. **User enters new password** → `updateUser()` called
8. **Success** → Redirect to login

---

## 📞 Still Not Working?

If you've done all the above and it still fails:

1. **Check email link URL**
   - Have user forward the reset email
   - Check if URL matches expected format
   - Look for `access_token`, `type=recovery`, `refresh_token`

2. **Check Supabase logs**
   - Go to: Supabase Dashboard → Logs → Auth Logs
   - Look for password reset events
   - Check for errors

3. **Test in incognito/private window**
   - Clear all cookies/cache
   - Request new reset
   - Try immediately

4. **Verify production deployment**
   - Ensure latest code is deployed
   - Check console logs on production
   - Compare with local development

---

## 🔐 Security Note

Password reset tokens should expire after a reasonable time (1 hour is standard). If users frequently report expired links:
- They might be using old emails
- Email delivery might be delayed
- They might be confusing multiple reset requests

**Solution:** Always request a fresh reset link and use it immediately.

---

**Status:** This guide covers the most common password reset issues. Follow Steps 1-3 and test!
