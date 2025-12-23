# Database Migrations

## How to Run Migrations

### Option 1: Supabase SQL Editor (Recommended)
1. Go to your Supabase dashboard: https://arqbxlaudfbmiqvwwmnt.supabase.co
2. Navigate to **SQL Editor**
3. Copy the contents of the migration file
4. Paste into a new query
5. Click **Run**

### Option 2: Supabase CLI
```bash
supabase db push
```

---

## Migration Files

### `create_subscriptions_and_payments.sql`
**Status**: ✅ Already applied
- Creates subscriptions table
- Creates payment_history table
- Adds RLS policies
- Adds indexes

### `add_dimepay_subscription_fields.sql`
**Status**: 🆕 **NEEDS TO BE RUN**
- Adds `dimepay_subscription_id` column (for recurring billing)
- Adds `dimepay_customer_id` column
- Adds `payment_method_last4` column
- Adds `payment_method_brand` column
- Creates indexes for fast lookups

**Why this migration?**
Enables DimePay recurring billing integration. These fields link our subscription records to DimePay's subscription system so webhooks can update the correct subscriptions.

### `create_global_config_table.sql`
**Status**: 🆕 **NEEDS TO BE RUN** (Critical!)
- Creates `global_config` table (single row for entire platform)
- Stores pricing plans, payment gateway credentials, email config
- Enables RLS (super admin only access)
- Adds trigger for auto-updating `updated_at` timestamp
- Inserts default configuration with demo DimePay credentials

**Why this migration?**
Fixes the issue where global config (pricing plans, DimePay credentials) was stored in each company's settings field. This caused:
- Feature edits not persisting across super admin accounts
- Inconsistent payment gateway credentials
- New companies not getting latest config

Now all super admins see the same configuration platform-wide!

---

## Testing Migrations

After running migrations, verify with:

```sql
-- Check subscriptions table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'subscriptions'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'subscriptions';
```

---

## Rollback (if needed)

To rollback `add_dimepay_subscription_fields.sql`:

```sql
-- Remove columns
ALTER TABLE subscriptions 
DROP COLUMN IF EXISTS dimepay_subscription_id,
DROP COLUMN IF EXISTS dimepay_customer_id,
DROP COLUMN IF EXISTS payment_method_last4,
DROP COLUMN IF EXISTS payment_method_brand;

-- Remove indexes
DROP INDEX IF EXISTS idx_subscriptions_dimepay_id;
DROP INDEX IF EXISTS idx_subscriptions_dimepay_customer_id;
```
