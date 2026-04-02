# 🔧 Brevo SMTP Setup & Employee Invite Testing Guide

## Overview

This guide will help you:
1. ✅ Set up Brevo API for email sending
2. ✅ Configure the Supabase Edge Function
3. ✅ Test employee invite emails with your Gmail (pushtechja@gmail.com)

---

## Step 1: Get Your Brevo API Key

1. **Login to Brevo:**
   - Go to: https://app.brevo.com/
   - Login with your account

2. **Navigate to API Settings:**
   - Click **Settings** (gear icon) in the top right
   - Go to **SMTP & API** in the left sidebar
   - Scroll to **API Keys** section

3. **Create/Copy API Key:**
   - If you don't have one, click **Generate a new API key**
   - Name it: `Payroll-Jam Production`
   - Copy the **API Key (v3)** - it looks like: `xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxx`
   - **⚠️ Important:** Save this key - you'll need it in the next step!

---

## Step 2: Set Supabase Secrets

Open your terminal and run these commands (replace with your actual values):

```bash
# Navigate to your project
cd /Users/aarongardiner/.cursor/worktrees/payroll-jam/czl

# Set Brevo API key (replace with your actual key from Step 1)
supabase secrets set BREVO_API_KEY=xkeysib-your-actual-api-key-here

# Set sender information
supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
```

**Verify secrets are set:**
```bash
supabase secrets list
```

You should see:
- ✅ `BREVO_API_KEY`
- ✅ `SMTP_FROM_NAME`
- ✅ `SMTP_FROM_EMAIL`

---

## Step 3: Deploy the Edge Function

```bash
# Deploy the send-email function
supabase functions deploy send-email --no-verify-jwt
```

**Expected output:**
```
Deployed Functions on project [your-project-ref]: send-email
```

---

## Step 4: Get Your Supabase Project URL

**Your project reference appears to be:** `arqbxlaudfbmiqvwwmnt`

You can verify this by:
1. Checking your Supabase dashboard: https://supabase.com/dashboard
2. Or running: `cat supabase/.temp/pooler-url` (should show your project ref)

**Quick Setup Script:**
I've created a setup script that automates most of this! Run:
```bash
./setup-brevo-email.sh
```

This will:
- ✅ Prompt for your Brevo API key
- ✅ Set all Supabase secrets
- ✅ Deploy the edge function
- ✅ Update your .env file automatically

---

## Step 5: Configure Environment Variables

**If you used the setup script, this is already done!** Otherwise:

Create or update your `.env` file in the project root:

```bash
# Create .env file if it doesn't exist
touch .env
```

Add this line (using your project ref `arqbxlaudfbmiqvwwmnt`):

```env
# API Configuration for Brevo Email Service
VITE_API_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1
```

**Note:** If you already have other Supabase config in `.env`, just add the `VITE_API_URL` line.

---

## Step 6: Test the Edge Function

Test that the function is working:

```bash
# Test with your email
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "pushtechja@gmail.com",
    "subject": "Test from Brevo API",
    "html": "<h1>Test Email</h1><p>This is a test email from Payroll-Jam!</p>",
    "text": "Test Email - This is a test email from Payroll-Jam!"
  }'
```

**Expected Response:**
```json
{"success":true,"message":"Email sent successfully","messageId":"..."}
```

**Check your email:**
- ✅ Should arrive in inbox (or spam folder)
- ✅ From: Payroll-Jam <9dea0e001@smtp-brevo.com>
- ✅ Subject: "Test from Brevo API"

---

## Step 7: Restart Your Dev Server

```bash
# Stop the current dev server (Ctrl+C if running)
# Then restart:
npm run dev
```

This ensures the `VITE_API_URL` environment variable is loaded.

---

## Step 8: Test Employee Invite in the App

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Login to your account**

3. **Go to Employees page:**
   - Click on **Employees** in the sidebar
   - Click **Invite Employee** button

4. **Fill in the invite form:**
   - **Email:** `pushtechja@gmail.com` (or your test email)
   - **First Name:** Test
   - **Last Name:** User
   - **Role:** Employee (or any role)

5. **Click "Send Invite"**

6. **Check the browser console:**
   You should see:
   ```
   📧 Sending employee invite via SMTP...
   ✅ Email sent successfully
   ```

7. **Check your email:**
   - Look for email from: Payroll-Jam <9dea0e001@smtp-brevo.com>
   - Subject: "Welcome to [Company Name] - Set Up Your Account"
   - Should contain a link to set up the account

---

## Step 9: Verify in Brevo Dashboard

1. Go to Brevo Dashboard: https://app.brevo.com/
2. Click **Statistics** → **Email Activity**
3. You should see your test emails listed
4. Status should be: **Delivered** or **Opened**

---

## 🐛 Troubleshooting

### Error: "BREVO_API_KEY not set"

**Solution:**
```bash
supabase secrets set BREVO_API_KEY=your_key_here
supabase functions deploy send-email --no-verify-jwt
```

### Error: "SMTP not configured - VITE_API_URL missing"

**Solution:**
1. Check `.env` file has `VITE_API_URL` set
2. Restart dev server completely
3. Clear browser cache (Cmd+Shift+R / Ctrl+Shift+R)
4. Check browser console: `console.log(import.meta.env.VITE_API_URL)`

### Error: "Invalid API key"

**Solution:**
- Double-check you copied the full API key
- Make sure it starts with `xkeysib-`
- Try generating a new API key in Brevo dashboard

### Email Not Arriving

**Check:**
1. ✅ Brevo dashboard → Statistics → See if email was sent
2. ✅ Check spam folder
3. ✅ Verify email address is correct
4. ✅ Check Brevo account limits (free tier: 300/day)
5. ✅ Check Supabase function logs:
   ```bash
   supabase functions logs send-email --follow
   ```

### Function Not Deployed

**Solution:**
```bash
# Make sure you're in the project directory
cd /Users/aarongardiner/.cursor/worktrees/payroll-jam/czl

# Check if you're linked to Supabase
supabase link --project-ref your-project-ref

# Deploy again
supabase functions deploy send-email --no-verify-jwt
```

---

## ✅ Success Checklist

- [ ] Brevo API key obtained and saved
- [ ] `BREVO_API_KEY` secret set in Supabase
- [ ] `SMTP_FROM_NAME` and `SMTP_FROM_EMAIL` secrets set
- [ ] Edge Function deployed successfully
- [ ] `VITE_API_URL` added to `.env` file
- [ ] Dev server restarted
- [ ] Test email sent via curl command
- [ ] Test email received in inbox
- [ ] Employee invite works in app
- [ ] Email received for employee invite

---

## 📧 Email Templates

The employee invite email includes:
- ✅ Professional HTML template
- ✅ Company branding
- ✅ Welcome message
- ✅ Secure invitation link
- ✅ Setup instructions

---

## 🚀 Next Steps

Once everything is working:

1. **Test with different email addresses:**
   - Try your other Gmail account
   - Test with different email providers

2. **Monitor Brevo Dashboard:**
   - Check delivery rates
   - Monitor sending quota
   - Review email activity

3. **Update sender email (optional):**
   - If you want to use a different sender email
   - Update `SMTP_FROM_EMAIL` secret
   - Redeploy the function

---

## 📝 Quick Reference

**Supabase Project URL Format:**
```
https://[project-ref].supabase.co
```

**Edge Function URL:**
```
https://[project-ref].supabase.co/functions/v1/send-email
```

**VITE_API_URL (for .env):**
```
https://[project-ref].supabase.co/functions/v1
```

---

**Need help?** Check the Brevo documentation: https://developers.brevo.com/
