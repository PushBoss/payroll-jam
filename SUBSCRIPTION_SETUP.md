# Subscription & Payment Backend Setup

## Database Migration

Run this SQL in your Supabase SQL Editor to create the subscription and payment tables:

```sql
-- File: db/migrations/create_subscriptions_and_payments.sql
```

This migration creates:
1. **subscriptions** table - Tracks company subscription plans
2. **payment_history** table - Records all payment transactions
3. Indexes for optimal query performance
4. RLS policies for secure data access

## How to Run the Migration

1. Go to your Supabase project: https://arqbxlaudfbmiqvwwmnt.supabase.co
2. Navigate to **SQL Editor**
3. Copy the entire contents of `db/migrations/create_subscriptions_and_payments.sql`
4. Paste into a new query
5. Click **Run** to execute

## Features Added

### Settings Page - Billing Tab
- **Current Subscription**: Shows active plan with billing details
- **Payment History**: Displays all payment transactions
- **Auto-sync**: Loads real data from Supabase when tab is opened

### Subscription Flow
When a user upgrades their plan:
1. Creates subscription record in `subscriptions` table
2. Creates payment record in `payment_history` table
3. Links subscription to company via `current_subscription_id`
4. Updates company plan field
5. Logs audit trail

### Cache Fixes
- **Version control**: Automatically clears old cache on app updates
- **Loading loop fix**: Proper mounted checks prevent infinite re-renders
- **Session management**: Clears stale session data on page load
- **Error handling**: Graceful fallback to localStorage if Supabase fails

## Testing

1. Login as any user
2. Go to **Settings → Billing** tab
3. Should see current plan and payment history
4. Try upgrading to a different plan
5. Payment should be recorded and displayed in history

## DimePay Production

Updated `.env.local` with production credentials:
- Secret Key: `sk_zPS5d7zPpXxcTEAecP5TUO3ZJHbOW`
- Merchant ID: `m9yCMgXfdeDjRto`

## Cache Issues Resolution

If users report stuck loading screens:
1. Cache version bumped to `v2` - will auto-clear old cache
2. AuthContext now has proper error boundaries
3. Session data cleared on every page load
4. Mounted checks prevent state updates after unmount

Users should no longer need to manually clear browser data.
