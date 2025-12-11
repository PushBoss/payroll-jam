-- Create subscriptions table to track user plans
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'starter', 'professional', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
    billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'yearly')),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'JMD',
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create payment_history table to track all payments
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'JMD',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method TEXT DEFAULT 'card',
    transaction_id TEXT,
    invoice_number TEXT,
    description TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_company_id ON payment_history(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON payment_history(payment_date DESC);

-- Add updated_at trigger for subscriptions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their company's subscription"
    ON subscriptions FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM app_users 
            WHERE email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Super admins can view all subscriptions"
    ON subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can insert subscriptions"
    ON subscriptions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can update subscriptions"
    ON subscriptions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

-- RLS Policies for payment_history
CREATE POLICY "Users can view their company's payment history"
    ON payment_history FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM app_users 
            WHERE email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Super admins can view all payment history"
    ON payment_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can insert payment records"
    ON payment_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

CREATE POLICY "Super admins can update payment records"
    ON payment_history FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE email = auth.jwt()->>'email' 
            AND role = 'SUPER_ADMIN'
        )
    );

-- Add subscription_id to companies table for quick lookup
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_subscription_id UUID REFERENCES subscriptions(id);
CREATE INDEX IF NOT EXISTS idx_companies_subscription ON companies(current_subscription_id);
