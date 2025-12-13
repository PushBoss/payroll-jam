# 🔧 Brevo API Setup - Quick Guide

## ✅ Why We're Switching

The SMTP implementation in the Edge Function was incomplete (TLS handshake not properly implemented). 
Brevo's REST API is:
- ✅ More reliable
- ✅ Easier to use
- ✅ Better error handling
- ✅ No TLS complexity

---

## 📋 Setup Steps

### Step 1: Get Your Brevo API Key

1. **Login to Brevo:**
   - Go to: https://app.brevo.com/
   - Login with your account

2. **Navigate to API Settings:**
   - Click **Settings** (gear icon)
   - Go to **SMTP & API**
   - Scroll to **API Keys** section

3. **Create/Copy API Key:**
   - If you don't have one, click **Generate a new API key**
   - Name it: `Payroll-Jam Production`
   - Copy the **API Key (v3)** - it looks like: `xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxx`

**⚠️ Important:** This is different from your SMTP password!

---

### Step 2: Set Supabase Secret

**In your terminal, run:**

```bash
supabase secrets set BREVO_API_KEY=xkeysib-your-actual-api-key-here
```

**Replace `xkeysib-your-actual-api-key-here` with your actual API key from Step 1.**

---

### Step 3: Verify Other Secrets

**Make sure these are still set:**

```bash
supabase secrets list
```

**Should show:**
- ✅ `BREVO_API_KEY` (new)
- ✅ `SMTP_FROM_NAME` (should be "Payroll-Jam")
- ✅ `SMTP_FROM_EMAIL` (should be "9dea0e001@smtp-brevo.com")

**If missing, set them:**
```bash
supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
```

---

### Step 4: Redeploy Edge Function

**The code is already updated! Just redeploy:**

```bash
supabase functions deploy send-email --no-verify-jwt
```

**Expected output:**
```
Deployed Functions on project arqbxlaudfbmiqvwwmnt: send-email
```

---

### Step 5: Test It

**Test the Edge Function:**

```bash
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "pushtechja@gmail.com",
    "subject": "Test from Brevo API",
    "html": "<h1>Test</h1><p>This should work now!</p>"
  }'
```

**Expected Response:**
```json
{"success":true,"message":"Email sent successfully","messageId":"..."}
```

**Check Email:**
- ✅ Should arrive in inbox (or spam)
- ✅ From: Payroll-Jam <9dea0e001@smtp-brevo.com>
- ✅ Subject: "Test from Brevo API"

---

## 🎯 What Changed

### Before (SMTP - Broken):
- ❌ Raw SMTP protocol
- ❌ TLS handshake incomplete
- ❌ Emails never actually sent
- ❌ No proper error handling

### After (Brevo API - Working):
- ✅ REST API call
- ✅ Proper authentication
- ✅ Emails actually sent
- ✅ Better error messages
- ✅ Message ID tracking

---

## 🐛 Troubleshooting

### Error: "BREVO_API_KEY not set"

**Solution:**
```bash
supabase secrets set BREVO_API_KEY=your_key_here
supabase functions deploy send-email --no-verify-jwt
```

### Error: "Invalid API key"

**Solution:**
- Double-check you copied the full API key
- Make sure it starts with `xkeysib-`
- Try generating a new API key in Brevo dashboard

### Error: "Unauthorized"

**Solution:**
- Verify API key is correct
- Check Brevo account is active
- Check if API key has sending permissions

### Email Still Not Arriving

**Check:**
1. ✅ Brevo dashboard → Statistics → See if email was sent
2. ✅ Check spam folder
3. ✅ Try different email address (Gmail, etc.)
4. ✅ Check Brevo account limits (free tier: 300/day)

---

## 📊 Verify in Brevo Dashboard

**After sending a test email:**

1. Go to Brevo Dashboard
2. Click **Statistics** → **Email Activity**
3. You should see your test email listed
4. Status should be: **Delivered** or **Opened**

**If status is "Bounced" or "Blocked":**
- Check recipient email address
- Check Brevo account reputation
- Contact Brevo support

---

## ✅ Success Checklist

- [ ] Brevo API key obtained
- [ ] `BREVO_API_KEY` secret set in Supabase
- [ ] Edge Function redeployed
- [ ] Test email sent successfully
- [ ] Email received in inbox
- [ ] Employee invitation works in app

---

## 🚀 Next Steps

Once this is working:

1. **Test Employee Invitation:**
   - Go to Employees → Invite Employee
   - Enter email and submit
   - Should receive real email now!

2. **Test Reseller Invitation:**
   - Login as Reseller
   - Invite a client
   - Should receive email

3. **Test Payslip Notification:**
   - Process a pay run
   - Finalize it
   - Employees should receive payslip emails

---

**All code changes are already pushed to GitHub!**  
**Just need to set the API key and redeploy!** 🎉

---

*Setup Guide - December 12, 2024*

