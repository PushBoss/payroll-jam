# 🔧 Fix: Brevo Sender Validation Error

## ❌ The Problem

**Error from Brevo:**
```
Sending has been rejected because the sender you used 9dea0e001@smtp-brevo.com is not valid. 
Validate your sender or authenticate your domain
```

**This means:** The sender email address needs to be verified in Brevo before you can send emails.

---

## ✅ Solution: Validate Sender in Brevo

### Step 1: Login to Brevo Dashboard

1. Go to: https://app.brevo.com/
2. Login with your account

### Step 2: Go to Senders & IP

1. Click **Settings** (gear icon)
2. Go to **Senders & IP**
3. Click **Senders** tab

### Step 3: Add/Verify Sender

**Option A: Verify Existing Sender**

1. Look for `9dea0e001@smtp-brevo.com` in the list
2. If it shows "Pending" or "Not Verified":
   - Click on it
   - Click **"Verify"** or **"Send Verification Email"**
   - Check your email for verification link
   - Click the link to verify

**Option B: Add New Sender**

1. Click **"Add a sender"** button
2. Enter email: `9dea0e001@smtp-brevo.com`
3. Enter name: `Payroll-Jam`
4. Click **"Save"**
5. Check your email for verification link
6. Click the link to verify

### Step 4: Wait for Verification

- Verification email usually arrives within 1-2 minutes
- Check spam folder if not in inbox
- Click the verification link
- Status should change to "Verified" or "Validated"

---

## 🔄 Alternative: Use Your Own Domain

**Better option for production:**

### Step 1: Add Your Domain

1. Brevo Dashboard → Settings → Senders & IP
2. Click **"Domains"** tab
3. Click **"Add a domain"**
4. Enter: `pushtech.live` (or your domain)
5. Click **"Add"**

### Step 2: Add DNS Records

Brevo will show you DNS records to add:

**SPF Record:**
```
Type: TXT
Name: @ (or pushtech.live)
Value: v=spf1 include:spf.brevo.com ~all
TTL: 3600
```

**DKIM Record:**
```
Type: TXT
Name: brevo._domainkey (or similar)
Value: [Brevo will provide this]
TTL: 3600
```

**Steps:**
1. Copy the DNS records from Brevo
2. Go to your domain registrar (where you bought pushtech.live)
3. Go to DNS settings
4. Add the TXT records
5. Wait 5-10 minutes for DNS propagation
6. Go back to Brevo and click **"Verify Domain"**

### Step 3: Update Edge Function

Once domain is verified, update the sender email:

**In Supabase secrets:**
```bash
supabase secrets set SMTP_FROM_EMAIL=noreply@pushtech.live
```

**Or use:**
```bash
supabase secrets set SMTP_FROM_EMAIL=payroll@pushtech.live
```

**Then redeploy:**
```bash
supabase functions deploy send-email --no-verify-jwt
```

---

## 🚀 Quick Fix (Use Verified Email)

**If you have another email that's already verified:**

1. **Check Brevo Senders list:**
   - See which emails are "Verified"
   - Use one of those instead

2. **Update Supabase secret:**
   ```bash
   supabase secrets set SMTP_FROM_EMAIL=your-verified-email@example.com
   ```

3. **Redeploy function:**
   ```bash
   supabase functions deploy send-email --no-verify-jwt
   ```

---

## 📋 Step-by-Step: Verify Sender Now

### Method 1: Verify Existing Sender (Fastest)

1. **Login to Brevo:** https://app.brevo.com/
2. **Go to:** Settings → Senders & IP → Senders
3. **Find:** `9dea0e001@smtp-brevo.com`
4. **Click:** On the email address
5. **Click:** "Verify" or "Send Verification Email"
6. **Check Email:** Look for verification email
7. **Click Link:** In the verification email
8. **Status Changes:** Should show "Verified"

**Then test again!**

---

### Method 2: Use Your Personal Email (Temporary)

**If you need emails working NOW:**

1. **Add your personal email as sender:**
   - Brevo → Settings → Senders & IP → Senders
   - Add: `agardiner@pushtech.live` (or your email)
   - Verify it

2. **Update Supabase secret:**
   ```bash
   supabase secrets set SMTP_FROM_EMAIL=agardiner@pushtech.live
   ```

3. **Redeploy:**
   ```bash
   supabase functions deploy send-email --no-verify-jwt
   ```

**This will work immediately!**

---

## 🧪 Test After Verification

**Once sender is verified:**

```bash
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "aaron.gardiner1@outlook.com",
    "subject": "Test after verification",
    "html": "<h1>Test</h1><p>This should work now!</p>"
  }'
```

**Expected:**
- ✅ No error from Brevo
- ✅ Email should arrive (check spam if not inbox)

---

## 📊 Verification Checklist

- [ ] Login to Brevo Dashboard
- [ ] Go to Settings → Senders & IP → Senders
- [ ] Find `9dea0e001@smtp-brevo.com`
- [ ] Click "Verify" or "Send Verification Email"
- [ ] Check email inbox for verification link
- [ ] Click verification link
- [ ] Status shows "Verified"
- [ ] Test sending email again
- [ ] Check Brevo logs - should show "Sent" not "Rejected"

---

## 🎯 Most Likely Solution

**The fastest fix:**

1. **Verify the sender in Brevo:**
   - Brevo Dashboard → Settings → Senders & IP
   - Find `9dea0e001@smtp-brevo.com`
   - Click "Verify"
   - Check email and click link

2. **That's it!** Emails should work immediately after verification.

**No code changes needed!** The Edge Function is correct, it just needs a verified sender.

---

## ⚠️ Important Notes

### Free Plan Limitations:
- You can verify senders on free plan ✅
- But you can't remove Brevo branding
- Daily limit still applies (300/day)

### After Verification:
- Emails will be sent from verified address
- Outlook may still block (free plan + shared IP)
- But at least Brevo won't reject them anymore!

---

## 🚀 Next Steps

1. **Verify sender in Brevo** (5 minutes)
2. **Test email sending** (should work now)
3. **If Outlook still blocks:** Consider upgrading or using your domain

**Let me know once you've verified the sender and we can test again!**

---

*Fix Guide - December 12, 2024*
