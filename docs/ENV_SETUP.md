# 🔧 Environment Variable Setup

## Required for SMTP Email Functionality

To enable live SMTP emails (employee invites, reseller invites, payslip notifications), you need to add the `VITE_API_URL` environment variable.

---

## 📝 Local Development

### 1. Create/Update `.env` file

In your project root (`/Users/aarongardiner/Desktop/payroll-jam/`), ensure your `.env` file contains:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycWJ4bGF1ZGZibWlxdnd3bW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQwMTg2NTAsImV4cCI6MjA0OTU5NDY1MH0.V_nKnOQqxNWiWN6aUTZDUhqODGKSaENqt0LfTMnUZFc
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycWJ4bGF1ZGZibWlxdnd3bW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDAxODY1MCwiZXhwIjoyMDQ5NTk0NjUwfQ.Iny4UO4EXkxPSPJsL8_mSHJVjh7ovMQCwHSNnNrPMzc

# API Configuration for SMTP Email Service
VITE_API_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1
```

### 2. Restart Dev Server

```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
npm run dev
```

---

## 🚀 Production Deployment

### Vercel

1. Go to your project settings: https://vercel.com/your-project/settings/environment-variables
2. Add the following environment variable:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1`
   - **Environment:** Production, Preview, Development (select all)
3. Redeploy your application

**Or via CLI:**
```bash
vercel env add VITE_API_URL
# Paste: https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1
# Select: Production, Preview, Development
```

### Netlify

1. Go to Site Settings → Environment Variables
2. Add new variable:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1`
3. Redeploy your site

**Or via CLI:**
```bash
netlify env:set VITE_API_URL "https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1"
```

### Other Platforms

Add the environment variable through your platform's dashboard or CLI:
```
VITE_API_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1
```

---

## ✅ Verification

After setting the environment variable and restarting/redeploying:

### 1. Check Browser Console

When you send an employee invite, you should see:
```
📧 Sending employee invite via SMTP...
✅ Email sent via SMTP successfully
```

Instead of:
```
SMTP not configured
⚠️ SMTP failed, falling back to EmailJS
```

### 2. Test Employee Invitation

1. Go to **Employees** → **Add Employee**
2. Fill in the form and submit
3. Check the console logs
4. The invited employee should receive an actual email (check spam folder)

### 3. Test Reseller Invitation

1. Login as a Reseller
2. Go to **Clients** → **Add New Client**
3. Enter email and submit
4. Check console logs
5. The invited company should receive an email

---

## 🐛 Troubleshooting

### "SMTP not configured" Error

**Cause:** `VITE_API_URL` is not set or not loaded

**Solution:**
1. Verify `.env` file has `VITE_API_URL`
2. Restart dev server completely (stop and start again)
3. Clear browser cache (Cmd+Shift+R / Ctrl+Shift+R)
4. Check browser console: `console.log(import.meta.env.VITE_API_URL)`

### Employee Save 400 Error

**Cause:** Missing `phone` or `address` fields in database insert

**Solution:**
✅ Already fixed in commit `d04688c`
- Updated `saveEmployee` to include `phone`, `address`, and `onboarding_token`

### Emails Not Received

1. **Check Supabase Function Logs:**
   ```bash
   supabase functions logs send-email --follow
   ```

2. **Test Function Directly:**
   ```bash
   curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
     -H "Content-Type: application/json" \
     -d '{
       "to": "test@example.com",
       "subject": "Test",
       "html": "<p>Test email</p>"
     }'
   ```

3. **Check Spam Folder:** Brevo emails might be filtered

4. **Verify SMTP Secrets:**
   ```bash
   supabase secrets list
   ```
   Should show: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`

---

## 📊 What's Fixed

### Commit: `d04688c`

1. ✅ Added `VITE_API_URL` to `.env` for SMTP email service
2. ✅ Fixed `saveEmployee` to include:
   - `phone` field
   - `address` field
   - `onboarding_token` field
3. ✅ Updated SuperAdmin email config section to show Brevo SMTP status
4. ✅ Removed old EmailJS configuration UI (replaced with SMTP info)

---

## 🎯 Expected Behavior

### Before Fix:
```
📧 Sending employee invite via SMTP...
SMTP not configured
⚠️ SMTP failed, falling back to EmailJS
[Email Simulation] Employee Invite
To: aaron.gardiner1@outlook.com
```

### After Fix:
```
📧 Sending employee invite via SMTP...
✅ Email sent via SMTP successfully
```

And the employee receives an actual email at `aaron.gardiner1@outlook.com` with:
- Subject: "You're Invited to Join [Company Name]"
- Professional HTML template
- Secure invitation link
- Company branding

---

## 📧 Email Templates

All emails now use professional HTML templates with:
- Company branding
- Responsive design
- Clear call-to-action buttons
- Footer with company information

**Supported Email Types:**
1. **Employee Invitations** - Secure token-based account setup
2. **Reseller Invitations** - Company invitation with acceptance link
3. **Payslip Notifications** - Alert when payslip is ready
4. **Password Reset** - Secure password reset links (future)

---

**All changes pushed to GitHub:** `https://github.com/PushBoss/payroll-jam.git`  
**Latest commit:** `d04688c`

🚀 **Ready for production testing!**

