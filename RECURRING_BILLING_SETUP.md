# DimePay Recurring Billing Implementation Guide

## 🎯 Overview

This implementation enables **automatic recurring subscriptions** using DimePay's order-based subscription model.

**Documentation**: https://docs.dimepay.net/%EF%B8%8F-dime-apis/z-recurring-payments

---

## 📋 Setup Checklist

### 1. Database Migration (CRITICAL - Do First!)

Run the SQL migration to add subscription tracking fields:

```bash
# File: db/migrations/add_dimepay_subscription_fields.sql
```

**How to run:**
1. Go to Supabase dashboard: https://arqbxlaudfbmiqvwwmnt.supabase.co
2. Navigate to **SQL Editor**
3. Copy contents of `db/migrations/add_dimepay_subscription_fields.sql`
4. Paste and click **Run**

This adds:
- `dimepay_subscription_id` - Links to DimePay subscription
- `dimepay_customer_id` - Customer identifier
- `payment_method_last4` - Card info for display
- `payment_method_brand` - Card type (Visa/Mastercard)

---

### 2. Configure Webhook in DimePay Dashboard

1. **Login to DimePay**: https://dashboard.dimepay.app (or sandbox)
2. **Navigate to**: Settings → Webhooks (or Developer Settings)
3. **Add Endpoint**: `https://payroll-jam.com/api/dimepay-webhook`
4. **Select Events**:
   - ✅ `subscription.created`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`
   - ✅ `subscription.canceled`
   - ✅ `subscription.paused`

5. **Copy Webhook Secret** (looks like: `whsec_xxxxxxxxxxxxx`)

---

### 3. Add Environment Variables to Vercel

**Vercel Dashboard** → Settings → Environment Variables

Add these variables:

```env
# Webhook secret from DimePay dashboard
DIMEPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Supabase service role key (for admin operations in webhook)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Existing DimePay credentials (should already be set)
DIMEPAY_SECRET_KEY_SANDBOX=sk_test_...
DIMEPAY_SECRET_KEY_PROD=sk_prod_...
```

**Important**: After adding, redeploy the app for env vars to take effect.

---

## 🔄 How It Works

### Initial Signup Flow

1. **User signs up** with a paid plan
2. **DimePay widget** creates subscription with:
   - `is_subscription: true`
   - `subscription_instructions: { recurring_frequency: 'MONTHLY', billing_cycles: 9999 }`
   - `tokenize: true` (stores card securely)
3. **First payment** is collected immediately
4. **Webhook `subscription.created`** fires → Creates subscription record in database
5. **Card is tokenized** by DimePay for future charges

### Recurring Billing (Automatic)

1. **DimePay charges card** automatically on `next_billing_date`
2. **Webhook `invoice.payment_succeeded`** fires → Records payment in database
3. **Subscription updated** with new `next_billing_date`
4. **Company status** remains `ACTIVE`

### Failed Payment Handling

1. **Charge fails** → Webhook `invoice.payment_failed` fires
2. **Retry logic**:
   - Attempt 1-2: Status → `PAST_DUE`, allow access
   - Attempt 3+: Status → `SUSPENDED`, block payroll access
3. **Email notifications** sent to company admin

---

## 🧪 Testing

### Sandbox Testing

**Test Card**: `4242 4242 4242 4242` (Any CVV, future expiry)

1. **Create test subscription**:
   - Sign up with Starter plan
   - Use test card
   - Complete checkout

2. **Verify subscription created**:
   ```sql
   SELECT * FROM subscriptions 
   WHERE company_id = 'your-company-id';
   ```

3. **Check webhook logs**:
   - Vercel Dashboard → Functions → dimepay-webhook
   - Should see `subscription.created` event

4. **Manually trigger payment**:
   - In DimePay dashboard, find subscription
   - Click "Trigger Next Billing"
   - Verify `invoice.payment_succeeded` webhook

5. **Test failed payment**:
   - Update card to failing test card: `4000 0000 0000 0002`
   - Trigger billing
   - Verify `invoice.payment_failed` webhook
   - Check subscription status → `past_due`

---

## 📦 Files Changed

### New Files
- ✅ `api/dimepay-webhook.ts` - Webhook handler
- ✅ `db/migrations/add_dimepay_subscription_fields.sql` - Database migration
- ✅ `db/migrations/MIGRATION_README.md` - Migration instructions
- ✅ `RECURRING_BILLING_SETUP.md` - This file

### Modified Files
- ✅ `services/dimePayService.ts` - Added subscription fields to JWT payload
- ✅ `pages/Signup.tsx` - Pass company_id in metadata for webhook
- ✅ `pages/Settings.tsx` - Simplified upgrade flow (webhook handles subscription)

---

## 🔍 Monitoring & Debugging

### Check Webhook Logs (Vercel)
```bash
vercel logs --function=api/dimepay-webhook
```

### Check Subscription Status (Supabase)
```sql
-- All active subscriptions
SELECT 
    s.plan_name,
    c.name as company_name,
    s.status,
    s.next_billing_date,
    s.dimepay_subscription_id
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
    c.name as company_name
FROM payment_history ph
JOIN companies c ON ph.company_id = c.id
ORDER BY ph.payment_date DESC
LIMIT 20;
```

### Failed Payment Recovery
```sql
-- Find subscriptions in past_due status
SELECT 
    s.*,
    c.name as company_name,
    c.email
FROM subscriptions s
JOIN companies c ON s.company_id = c.id
WHERE s.status = 'past_due';
```

---

## ⚠️ Important Notes

1. **Billing Cycles**: Set to `9999` for effectively unlimited subscriptions until manually cancelled

2. **Webhook Security**: Always verify signature - prevents fraudulent webhook calls

3. **Idempotency**: Webhook uses `transaction_id` to prevent duplicate payment records

4. **Grace Period**: Users get 3 failed payment attempts before suspension

5. **Manual Cancellation**: To cancel a subscription, you'll need to:
   - Call DimePay API to cancel subscription
   - Or cancel via DimePay dashboard
   - Webhook will update your database automatically

---

## 🚀 Post-Deployment

After deploying to production:

1. **Verify webhook endpoint**:
   ```bash
   curl -X POST https://payroll-jam.com/api/dimepay-webhook \
     -H "Content-Type: application/json" \
     -d '{"type":"test"}'
   ```
   Should return: `{"received":true}`

2. **Test with real subscription**:
   - Create account with live payment
   - Check DimePay dashboard for subscription
   - Verify webhook fired and created database records

3. **Monitor for 30 days**:
   - Watch for first recurring charge
   - Verify webhook processes successfully
   - Check payment recorded in database

---

## 📞 Support

If recurring billing fails:
1. Check webhook logs in Vercel
2. Verify webhook secret in env vars
3. Confirm webhook URL is registered in DimePay
4. Check DimePay dashboard for subscription status
5. Review Supabase logs for database errors

---

## 💡 Future Enhancements

- [ ] Add prorated upgrades for mid-month plan changes
- [ ] Email notifications for upcoming renewals (3 days before)
- [ ] Email notifications for failed payments
- [ ] Self-service subscription cancellation
- [ ] Dunning management (retry failed payments with delays)
- [ ] Usage-based billing for per-employee plans
- [ ] Annual to monthly plan switches (and vice versa)
