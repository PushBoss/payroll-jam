# Public Payslip Download - Edge Function Setup

## 🔴 Problem

The public payslip download page was getting **406 errors** from Supabase because:
- Unauthenticated users (Free plan employees) can't access `pay_runs` table
- Row Level Security (RLS) policies block requests without auth
- Direct database queries fail for logged-out users

## ✅ Solution

Created **`get-payslip` Supabase Edge Function** that:
- Accepts secure download token
- Uses SERVICE_ROLE_KEY to bypass RLS
- Fetches payslip data from database
- Returns data to unauthenticated users

---

## 📁 Files Created

### 1. **`supabase/functions/get-payslip/index.ts`**
Main Edge Function code that:
- Validates download token
- Decodes employeeId + runId from token
- Fetches pay run from database (bypassing RLS)
- Fetches employee and company info
- Returns payslip data as JSON

### 2. **`supabase/functions/get-payslip/deno.json`**
Deno configuration for the function

### 3. **`deploy-get-payslip-function.sh`**
Deployment script to push function to Supabase

---

## 🚀 Deployment Instructions

### Step 1: Install Supabase CLI (if not installed)

```bash
brew install supabase/tap/supabase
```

Verify installation:
```bash
supabase --version
```

### Step 2: Login to Supabase

```bash
supabase login
```

This will open a browser for authentication.

### Step 3: Link to Your Project

```bash
supabase link --project-ref arqbxlaudfbmiqvwwmnt
```

Enter your database password when prompted.

### Step 4: Deploy the Function

**Option A: Use the deployment script (recommended)**
```bash
./deploy-get-payslip-function.sh
```

**Option B: Manual deployment**
```bash
supabase functions deploy get-payslip --project-ref arqbxlaudfbmiqvwwmnt
```

### Step 5: Verify Deployment

Check the Supabase Dashboard:
1. Go to: https://supabase.com/dashboard/project/arqbxlaudfbmiqvwwmnt/functions
2. You should see `get-payslip` listed
3. Status should be "Active"

---

## 🔐 Environment Variables

The Edge Function requires these environment variables (automatically available in Supabase):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)

These are **automatically injected** by Supabase. No manual setup needed.

---

## 🧪 Testing the Edge Function

### Test with curl:

```bash
curl -X POST \
  https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/get-payslip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycWJ4bGF1ZGZibWlxdnd3bW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNjE4MzcsImV4cCI6MjA4MDczNzgzN30.XVgTkgb-IX4QqpDyrkhWf8XC7jhOLnZwqVAi75IGz70" \
  -d '{
    "token": "eyJlbXBsb3llZUlkIjoiMTIzIiwicnVuSWQiOiI0NTYiLCJwZXJpb2QiOiIyMDI1LTAxIn0="
  }'

  curl -X POST \
  https://arqbxlaudfbmiqvwwmnt.supabase.co/functions/v1/get-payslip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycWJ4bGF1ZGZibWlxdnd3bW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNjE4MzcsImV4cCI6MjA4MDczNzgzN30.XVgTkgb-IX4QqpDyrkhWf8XC7jhOLnZwqVAi75IGz70" \
  -d '{"eyJlbXBsb3llZUlkIjoiMTIzIiwicnVuSWQiOiI0NTYiLCJwZXJpb2QiOiIyMDI1LTAxIn0="}'

Replace `YOUR_ANON_KEY` with your actual Supabase anon key.

### Expected Response (Success):

```json
{
  "success": true,
  "data": {
    "lineItem": {
      "employeeId": "123",
      "grossPay": 5000,
      "deductions": {},
      "netPay": 4500
    },
    "companyName": "Your Company",
    "payPeriod": "2025-01",
    "payDate": "2025-01-31"
  }
}
```

### Expected Response (Error):

```json
{
  "error": "Pay run not found"
}
```

---

## 🔄 How It Works

### Frontend Flow:

```
1. User clicks "Download PDF" in email
   ↓
2. PublicPayslipDownload page loads with token
   ↓
3. Page calls Edge Function: POST /functions/v1/get-payslip
   ↓
4. Edge Function validates token
   ↓
5. Edge Function fetches data (using service role)
   ↓
6. Returns payslip data to page
   ↓
7. ✅ Payslip displays successfully
```

### Edge Function Flow:

```typescript
1. Receive POST request with { token }
2. Decode token → { employeeId, runId, period }
3. Create Supabase client with SERVICE_ROLE_KEY
4. Fetch pay_runs where id = runId
5. Find line item where employeeId matches
6. Fetch employee info
7. Fetch company info
8. Return JSON response with payslip data
```

---

## 🔒 Security Considerations

### ✅ Secure Aspects:

1. **Token-based access**: Only users with valid token can access
2. **Time-limited**: Tokens can be made to expire (optional enhancement)
3. **Employee-specific**: Token tied to specific employee + pay run
4. **No direct database access**: Edge Function acts as secure gateway
5. **Service role key**: Only Edge Function has elevated privileges

### ⚠️ Security Notes:

- Token is **not encrypted**, only base64 encoded
- Anyone with the token can access that specific payslip
- Tokens don't currently expire (consider adding expiration)
- No rate limiting (Supabase handles this at platform level)

### 🔮 Future Enhancements:

1. Add token expiration (e.g., 30 days after email sent)
2. Add IP-based rate limiting
3. Log access attempts for audit trail
4. Add token revocation mechanism
5. Implement one-time use tokens

---

## 🐛 Troubleshooting

### Issue: "Function not found" error

**Solution:**
```bash
# Re-deploy the function
supabase functions deploy get-payslip --project-ref arqbxlaudfbmiqvwwmnt
```

### Issue: "SERVICE_ROLE_KEY not set" error

**Solution:**
The SERVICE_ROLE_KEY should be automatically available. Check Supabase Dashboard:
1. Go to Settings → API
2. Copy the `service_role` key
3. It should be automatically injected into Edge Functions

### Issue: CORS errors

**Solution:**
The function includes CORS headers. If you still get CORS errors:
1. Check that `Access-Control-Allow-Origin: *` is in the response
2. Verify the request includes proper headers
3. Check browser console for specific CORS error

### Issue: 406 errors persist

**Solution:**
This means the Edge Function isn't being called. Check:
1. Function is deployed: `supabase functions list`
2. Function URL is correct in code
3. VITE_API_URL or VITE_SUPABASE_URL is set correctly
4. Authorization header includes valid anon key

---

## 📊 Monitoring

### View Function Logs:

```bash
supabase functions logs get-payslip
```

### In Supabase Dashboard:

1. Go to: Edge Functions → get-payslip
2. Click "Logs" tab
3. See real-time requests and errors

---

## 🔄 Updating the Function

After making changes to `supabase/functions/get-payslip/index.ts`:

```bash
# Re-deploy
./deploy-get-payslip-function.sh

# Or manually
supabase functions deploy get-payslip --project-ref arqbxlaudfbmiqvwwmnt
```

Changes take effect immediately (no restart needed).

---

## ✅ Deployment Checklist

- [ ] Supabase CLI installed
- [ ] Logged in to Supabase (`supabase login`)
- [ ] Project linked (`supabase link`)
- [ ] Edge Function deployed (`./deploy-get-payslip-function.sh`)
- [ ] Function appears in Supabase Dashboard
- [ ] Test with sample token
- [ ] Verify payslip loads in browser
- [ ] Check function logs for errors

---

## 📝 Summary

The `get-payslip` Edge Function solves the RLS/authentication problem for public payslip downloads. It acts as a secure API gateway that:
- Validates tokens
- Fetches data with elevated privileges
- Returns data to unauthenticated users
- Maintains security through token-based access

This enables Free plan employees to download their payslips without logging in, while keeping the database secure with RLS enabled.

---

**Status:** Ready to deploy
**Last Updated:** 2025
