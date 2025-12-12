# 🔍 Debug Email Issue - Step by Step

The console shows `📧 Sending employee invite via SMTP...` but no email arrives.
Let's find out where the problem is.

---

## Step 1: Check Browser Console (Full Output)

**In your browser console, look for ANY messages after:**
```
📧 Sending employee invite via SMTP...
```

**Possible messages you might see:**
- ✅ `✅ Email sent via SMTP successfully` - Good, means frontend → Edge Function worked
- ⚠️ `⚠️ SMTP failed, falling back to EmailJS` - Edge Function failed
- ❌ `Error: ...` - Some error occurred
- 🤔 Nothing - Request failed silently (network error)

**Action:** Copy and share the FULL console output.

---

## Step 2: Check Browser Network Tab

1. **Open DevTools:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Go to **Network** tab

2. **Look for the request:**
   - Find a request to `/send-email` or containing `functions/v1/send-email`
   - Click on it

3. **Check Response:**
   - **Status:** Should be `200 OK`
   - **Response Tab:** Should show JSON like:
     ```json
     {"success": true, "message": "Email sent successfully"}
     ```
   - **If Status is 4xx or 5xx:** Copy the error message

**Action:** Share the Status code and Response body.

---

## Step 3: Test Edge Function Directly (Manual)

**Run this in YOUR terminal (not sandbox):**

```bash
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "aaron.gardiner1@outlook.com",
    "subject": "Test Email from Payroll-Jam",
    "html": "<h1>Test</h1><p>If you receive this, SMTP is working!</p>"
  }'
```

**Expected Response:**
```json
{"success":true,"message":"Email sent successfully"}
```

**Action:** Run this and share:
1. The response you get
2. Did the email arrive at `aaron.gardiner1@outlook.com`?

---

## Step 4: Check Supabase Secrets

**Verify SMTP secrets are set:**

```bash
supabase secrets list
```

**Should show:**
```
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM_NAME
SMTP_FROM_EMAIL
```

**Action:** Confirm all 6 secrets are listed.

---

## Step 5: Check Edge Function Deployment

**List deployed functions:**

```bash
supabase functions list
```

**Should show:**
```
send-email (deployed)
```

**If NOT deployed, redeploy:**

```bash
supabase functions deploy send-email --no-verify-jwt
```

---

## Step 6: Check Brevo Account Status

**Login to Brevo:** https://app.brevo.com/

1. **Check Email Limit:**
   - Go to Dashboard
   - Check "Emails sent today"
   - Free tier: 300 emails/day limit
   - **If at limit:** Wait until tomorrow or upgrade

2. **Check Sending Domain:**
   - Go to Settings → Senders & IP
   - Verify `9dea0e001@smtp-brevo.com` is active

3. **Check SMTP Credentials:**
   - Go to Settings → SMTP & API
   - Verify credentials match:
     - Login: `9dea0e001@smtp-brevo.com`
     - Port: `587`

---

## Step 7: Test with Simpler Email (Debug)

**Try sending to a different email:**

```bash
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "agardiner@pushtech.live",
    "subject": "Test",
    "html": "<p>Test</p>"
  }'
```

**Check:**
- Does this email arrive?
- If yes → Problem is with Outlook blocking emails
- If no → Problem is with SMTP setup

---

## Common Issues & Solutions

### Issue 1: CORS Error in Browser
**Symptom:** Network tab shows CORS error  
**Solution:** Edge Function needs CORS headers (should already have them)

### Issue 2: Outlook Blocking Emails
**Symptom:** No error, but email doesn't arrive  
**Solutions:**
- Check **Spam/Junk** folder in Outlook
- Try different email (Gmail, etc.)
- Outlook might be blocking Brevo's domain

### Issue 3: Brevo Daily Limit Reached
**Symptom:** Brevo returns error "Daily limit exceeded"  
**Solution:** Wait until tomorrow or upgrade Brevo plan

### Issue 4: Invalid SMTP Credentials
**Symptom:** Edge Function returns auth error  
**Solution:** Re-set Brevo credentials:
```bash
supabase secrets set SMTP_USER=9dea0e001@smtp-brevo.com
supabase secrets set SMTP_PASS=g5JHWNhvBUqp49yw
```

### Issue 5: Edge Function Not Deployed
**Symptom:** 404 error when calling Edge Function  
**Solution:** Redeploy:
```bash
supabase functions deploy send-email --no-verify-jwt
```

---

## Quick Diagnostic Commands

**Run all these and share results:**

```bash
# 1. Test Edge Function
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","html":"<p>Test</p>"}'

# 2. List secrets
supabase secrets list

# 3. List functions
supabase functions list

# 4. Check project
supabase status
```

---

## Next Steps Based on Results

### If curl test works and email arrives:
✅ **SMTP is working!**  
❌ **Problem is in frontend code**
- Check `VITE_API_URL` in Vercel environment variables
- Check browser console for full error

### If curl test fails with error:
❌ **Edge Function has issues**
- Check the error message
- Verify Brevo credentials
- Redeploy function

### If curl succeeds but no email:
⚠️ **Email delivery issue**
- Check Brevo dashboard for sent emails
- Check spam folder
- Try different email address
- Contact Brevo support

---

## Email Delivery Checklist

For `aaron.gardiner1@outlook.com`:

- [ ] Check **Inbox**
- [ ] Check **Spam/Junk** folder
- [ ] Check **Deleted Items** (sometimes auto-filtered)
- [ ] Check Outlook **Rules** (might be auto-moving)
- [ ] Try sending to `agardiner@pushtech.live` instead
- [ ] Try sending to a Gmail address

**Outlook is known to be strict with new SMTP senders!**

---

## What to Share for More Help

Please run the commands above and share:

1. ✅ Full browser console output (after clicking invite)
2. ✅ Network tab Status + Response for `/send-email` request
3. ✅ Result of `curl` test command
4. ✅ Output of `supabase secrets list`
5. ✅ Output of `supabase functions list`
6. ✅ Did email arrive at ANY address? (try multiple)

With this info, I can pinpoint exactly what's wrong! 🔍

---

*Debug Guide - December 12, 2024*

