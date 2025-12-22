-- Add DimePay Subscription Tracking Fields
-- Migration for recurring billing integration
-- Date: 2025-01-09

-- Add subscription tracking fields to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS dimepay_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS dimepay_customer_id TEXT;

-- Add payment method details for display
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT,
ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;

-- Create index for fast lookups by DimePay subscription ID
CREATE INDEX IF NOT EXISTS idx_subscriptions_dimepay_id ON subscriptions(dimepay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dimepay_customer_id ON subscriptions(dimepay_customer_id);

-- Add comment
COMMENT ON COLUMN subscriptions.dimepay_subscription_id IS 'DimePay subscription identifier for recurring billing';
COMMENT ON COLUMN subscriptions.dimepay_customer_id IS 'DimePay customer identifier';
COMMENT ON COLUMN subscriptions.payment_method_last4 IS 'Last 4 digits of payment card';
COMMENT ON COLUMN subscriptions.payment_method_brand IS 'Card brand (visa, mastercard, etc)';

-- Update existing subscriptions to have default values (optional)
-- UPDATE subscriptions SET payment_method_last4 = '****' WHERE payment_method_last4 IS NULL;
