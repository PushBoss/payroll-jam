# 🚀 Quick Deploy Guide - Your Project

## Your Supabase Project Info

- **Project Reference**: `arqbxlaudfbmiqvwwmnt`
- **Project URL**: `https://arqbxlaudfbmiqvwwmnt.supabase.co`
- **Function URL**: `https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email`

---

## Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

## Step 2: Login to Supabase

```bash
supabase login
```

This will open your browser - login with your Supabase account.

## Step 3: Link Your Project

```bash
cd /Users/aarongardiner/Desktop/payroll-jam
supabase link --project-ref arqbxlaudfbmiqvwwmnt
```

## Step 4: Set SMTP Secrets

Copy and paste these commands one by one:

```bash
supabase secrets set SMTP_HOST=smtp-relay.brevo.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=9dea0e001@smtp-brevo.com
supabase secrets set SMTP_PASS=g5JHWNhvBUqp49yw
supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
```

## Step 5: Deploy the Function

```bash
supabase functions deploy send-email --no-verify-jwt
```

## Step 6: Verify Deployment

Test the function:

```bash
curl -X POST https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test from Payroll-Jam",
    "html": "<h1>Success!</h1><p>Your SMTP email function is working!</p>",
    "text": "Success! Your SMTP email function is working!"
  }'
```

Replace `your-email@example.com` with your actual email.

## Step 7: Update Your App

Your `.env` file has been created with:

```
VITE_SUPABASE_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co
VITE_API_URL=https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/send-email
```

**You still need to add:**
1. Your Supabase Anon Key
2. Your Service Role Key (for admin operations)

Get these from:
https://app.supabase.com/project/arqbxlaudfbmiqvwwmnt/settings/api

## Step 8: Restart Dev Server

```bash
npm run dev
```

---

## ✅ Checklist

- [ ] Install Supabase CLI
- [ ] Login to Supabase
- [ ] Link project
- [ ] Set SMTP secrets
- [ ] Deploy function
- [ ] Test function with curl
- [ ] Add Supabase keys to .env
- [ ] Restart dev server
- [ ] Test email in app

---

## 🔗 Useful Links

- **Supabase Dashboard**: https://app.supabase.com/project/arqbxlaudfbmiqvwwmnt
- **Edge Functions**: https://app.supabase.com/project/arqbxlaudfbmiqvwwmnt/functions
- **API Settings**: https://app.supabase.com/project/arqbxlaudfbmiqvwwmnt/settings/api
- **Brevo Dashboard**: https://app.brevo.com/

---

## 🎯 One-Command Deploy (Automated)

Or just run the automated script:

```bash
./deploy-smtp-function.sh
```

It will do steps 1-5 automatically!

---

## 📧 After Deployment

Your app will now send professional emails via Brevo SMTP for:

✉️ **Employee Invitations** - Beautiful welcome emails  
✉️ **Payslip Notifications** - Professional payment notices  
✉️ **Reseller Invites** - Client onboarding emails  

All emails use HTML templates and your branding!

---

## 🐛 Troubleshooting

**Function not deploying?**
```bash
supabase functions list  # Check if it's there
supabase functions logs send-email  # Check logs
```

**Secrets not working?**
```bash
supabase secrets list  # Verify they're set
```

**CORS errors?**
- Function already has CORS headers configured
- Make sure `--no-verify-jwt` flag was used

**Still having issues?**
Check the full guide: `DEPLOY_INSTRUCTIONS.md`

