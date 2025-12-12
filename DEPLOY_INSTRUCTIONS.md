# 🚀 Deploy SMTP Email Function to Supabase

## Quick Deploy (Automated Script)

```bash
# Run the automated deployment script
./deploy-smtp-function.sh
```

The script will:
1. Check/install Supabase CLI
2. Login to Supabase
3. Link your project
4. Set all SMTP secrets
5. Deploy the function
6. Provide your function URL

---

## Manual Deploy (Step-by-Step)

### Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

### Step 2: Login to Supabase

```bash
supabase login
```

This will open your browser. Login with your Supabase account.

### Step 3: Find Your Project Reference

1. Go to https://app.supabase.com/
2. Select your project
3. Go to **Settings** → **General**
4. Copy your **Reference ID**

### Step 4: Link Your Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with the reference ID you copied.

### Step 5: Set SMTP Secrets

Run each command one by one:

```bash
supabase secrets set SMTP_HOST=smtp-relay.brevo.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=9dea0e001@smtp-brevo.com
supabase secrets set SMTP_PASS=g5JHWNhvBUqp49yw
supabase secrets set SMTP_FROM_NAME="Payroll-Jam"
supabase secrets set SMTP_FROM_EMAIL=9dea0e001@smtp-brevo.com
```

### Step 6: Deploy the Function

```bash
supabase functions deploy send-email --no-verify-jwt
```

The `--no-verify-jwt` flag allows the function to be called from your frontend without authentication.

### Step 7: Get Your Function URL

Your function URL will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email
```

---

## Update Your App

### 1. Create `.env.local` file

```bash
# In your project root
cat > .env.local << EOF
VITE_API_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email
EOF
```

Replace `YOUR_PROJECT_REF` with your actual project reference.

### 2. Update Email Service

The app will automatically use SMTP when `VITE_API_URL` is set.

---

## Test Your Function

### Test with curl:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test Email from Payroll-Jam",
    "html": "<h1>Hello!</h1><p>This is a test email from your Supabase function.</p>",
    "text": "Hello! This is a test email."
  }'
```

### Expected Response:

```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

---

## Monitor Your Function

### View Logs:

```bash
supabase functions logs send-email
```

### View in Dashboard:

1. Go to https://app.supabase.com/
2. Select your project
3. Go to **Edge Functions**
4. Click **send-email**
5. View logs and invocations

---

## Troubleshooting

### "Function not found"

```bash
# Check deployed functions
supabase functions list
```

If not listed, redeploy:
```bash
supabase functions deploy send-email --no-verify-jwt
```

### "Secrets not set"

```bash
# List current secrets
supabase secrets list

# Re-set missing secrets
supabase secrets set SMTP_HOST=smtp-relay.brevo.com
# ... etc
```

### "401 Unauthorized"

The function needs `--no-verify-jwt` flag:
```bash
supabase functions deploy send-email --no-verify-jwt
```

### "CORS Error"

CORS headers are already configured in the function. Make sure you're calling from the correct domain.

### "SMTP Connection Failed"

1. Check secrets are set: `supabase secrets list`
2. Verify Brevo credentials at https://app.brevo.com/
3. Check Brevo account is active
4. View function logs: `supabase functions logs send-email`

---

## Update Function (After Changes)

```bash
# Redeploy after making changes
supabase functions deploy send-email --no-verify-jwt
```

---

## Remove Function (If Needed)

```bash
supabase functions delete send-email
```

---

## Environment Variables Reference

| Variable | Value |
|----------|-------|
| SMTP_HOST | smtp-relay.brevo.com |
| SMTP_PORT | 587 |
| SMTP_USER | 9dea0e001@smtp-brevo.com |
| SMTP_PASS | g5JHWNhvBUqp49yw |
| SMTP_FROM_NAME | Payroll-Jam |
| SMTP_FROM_EMAIL | 9dea0e001@smtp-brevo.com |

---

## Next Steps After Deployment

1. ✅ Deploy function
2. ✅ Test with curl
3. ✅ Update `.env.local`
4. ✅ Restart development server
5. ✅ Test email sending in app
6. ✅ Monitor Brevo dashboard
7. ✅ Check Supabase function logs

---

## Support

- **Supabase Docs**: https://supabase.com/docs/guides/functions
- **Brevo Dashboard**: https://app.brevo.com/
- **Function Logs**: `supabase functions logs send-email`

Need help? Check the logs first, then review this guide.

