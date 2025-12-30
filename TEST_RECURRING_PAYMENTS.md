# Recurring Payments Test Guide

## Quick Test (Recommended)

### Step 1: Test via Real Signup Flow

1. **Go to**: https://www.payrolljam.com/?page=signup
2. **Select**: Starter, Pro, or Reseller plan
3. **Use DimePay Test Card**: `4242 4242 4242 4242`
   - CVV: `123`
   - Expiry: `12/25` (any future date)
4. **Complete signup**
5. **Check Vercel logs**:
   ```bash
   vercel logs --function=api/dimepay-webhook --follow
   ```
6. **Verify in Supabase**:
   ```sql
   -- Get your company ID from the signup
   SELECT id, name, email FROM companies WHERE email = 'your-test-email@example.com';
   
   -- Check subscription was created
   SELECT * FROM subscriptions 
   WHERE company_id = 'your-company-id'
   ORDER BY created_at DESC LIMIT 1;
   
   -- Check initial payment
   SELECT * FROM payment_history 
   WHERE company_id = 'your-company-id'
   ORDER BY payment_date DESC LIMIT 1;
   ```

### Step 2: Test Recurring Payment (via DimePay Dashboard)

1. **Login to DimePay Dashboard**: https://dashboard.dimepay.app
2. **Find your test subscription**
3. **Manually trigger next billing** (if available)
4. **Check webhook logs** in Vercel
5. **Verify payment recorded** in database

## Test Script (Requires Webhook Secret)

### Prerequisites

Get the webhook secret from Vercel:
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Find `DIMEPAY_WEBHOOK_SECRET`
3. Copy the value

### Run Tests

```bash
# Set the webhook secret
export DIMEPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Test subscription.created event
node scripts/test-recurring-payments.js subscription.created https://www.payrolljam.com/api/dimepay-webhook

# Test invoice.payment_succeeded event
node scripts/test-recurring-payments.js invoice.payment_succeeded https://www.payrolljam.com/api/dimepay-webhook

# Test all events
node scripts/test-recurring-payments.js all https://www.payrolljam.com/api/dimepay-webhook
```

## What to Check

### ✅ After Signup (subscription.created)
- [ ] Subscription record created in `subscriptions` table
- [ ] Initial payment recorded in `payment_history` table
- [ ] `dimepay_subscription_id` is set
- [ ] `status` is 'active'
- [ ] `next_billing_date` is ~30 days from now

### ✅ After Recurring Payment (invoice.payment_succeeded)
- [ ] New payment record in `payment_history`
- [ ] `next_billing_date` updated
- [ ] `status` remains 'active'
- [ ] `companies.subscription_status` is 'ACTIVE'

### ✅ After Failed Payment (invoice.payment_failed)
- [ ] Failed payment recorded with status 'failed'
- [ ] After 1-2 failures: `status` = 'past_due'
- [ ] After 3+ failures: `status` = 'past_due', `companies.subscription_status` = 'SUSPENDED'

## Database Verification Queries

```sql
-- All active subscriptions
SELECT 
    s.id,
    s.plan_name,
    s.status,
    s.next_billing_date,
    s.dimepay_subscription_id,
    c.name as company_name
FROM subscriptions s
JOIN companies c ON s.company_id = c.id
WHERE s.status = 'active'
ORDER BY s.next_billing_date;

-- Recent payments
SELECT 
    ph.payment_date,
    ph.amount,
    ph.status,
    ph.description,
    ph.transaction_id,
    c.name as company_name
FROM payment_history ph
JOIN companies c ON ph.company_id = c.id
ORDER BY ph.payment_date DESC
LIMIT 20;
```

## Troubleshooting

### Webhook Returns 500
- **Check**: `DIMEPAY_WEBHOOK_SECRET` is set in Vercel
- **Check**: `VITE_SUPABASE_URL` is set
- **Check**: `SUPABASE_SERVICE_ROLE_KEY` is set
- **View logs**: `vercel logs --function=api/dimepay-webhook`

### Signature Verification Fails
- Ensure webhook secret matches DimePay dashboard
- Check signature header name (`dimepay-signature` or `x-dimepay-signature`)

### Subscription Not Created
- Verify `company_id` exists in metadata
- Check RLS policies allow inserts
- Verify Supabase connection
