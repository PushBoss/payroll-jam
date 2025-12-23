-- Create dedicated global_config table for platform-wide settings
-- This fixes the issue where global config is stored in each company's settings
-- Date: 2025-01-09

-- Create global_config table
CREATE TABLE IF NOT EXISTS global_config (
  id TEXT PRIMARY KEY DEFAULT 'platform',  -- Single row for entire platform
  config JSONB NOT NULL DEFAULT '{}',      -- Stores all platform configuration
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,                         -- Track which super admin made changes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE global_config IS 'Platform-wide configuration shared across all super admin accounts';
COMMENT ON COLUMN global_config.config IS 'JSONB containing pricing plans, payment gateway credentials, email config, etc';
COMMENT ON COLUMN global_config.updated_by IS 'Super admin user ID who last updated the config';

-- Enable Row Level Security
ALTER TABLE global_config ENABLE ROW LEVEL SECURITY;

-- Policy: Only super admins can read global config
CREATE POLICY "Super admins can view global config"
ON global_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
);

-- Policy: Only super admins can update global config
CREATE POLICY "Super admins can update global config"
ON global_config
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE id = auth.uid() 
    AND role = 'SUPER_ADMIN'
  )
);

-- Insert default config (will be migrated from existing companies.settings)
-- Note: Run this after the table is created
INSERT INTO global_config (id, config, updated_at) 
VALUES (
  'platform',
  jsonb_build_object(
    'dataSource', 'SUPABASE',
    'currency', 'JMD',
    'maintenanceMode', false,
    'emailjs', jsonb_build_object(
      'serviceId', '',
      'templateId', '',
      'publicKey', ''
    ),
    'dimepay', jsonb_build_object(
      'enabled', true,
      'environment', 'sandbox',
      'sandbox', jsonb_build_object(
        'apiKey', 'ck_LGKMlNpFiRr63ce0s621VuGLjYdey',
        'secretKey', 'sk_rYoMG45jVM2gvhE-pm4to9EZoW9tD',
        'merchantId', 'mQn_iBSUd-KNq3K',
        'domain', 'https://staging.api.dimepay.app'
      ),
      'production', jsonb_build_object(
        'apiKey', '',
        'secretKey', '',
        'merchantId', '',
        'domain', 'https://api.dimepay.app'
      ),
      'passFeesTo', 'MERCHANT'
    ),
    'paypal', jsonb_build_object(
      'enabled', false,
      'mode', 'sandbox',
      'clientId', '',
      'secret', ''
    ),
    'stripe', jsonb_build_object(
      'enabled', false,
      'publishableKey', '',
      'secretKey', ''
    ),
    'manual', jsonb_build_object(
      'enabled', true,
      'instructions', 'Please wire funds to NCB Account 404-392-XXX. Ref: Company Name'
    ),
    'systemBanner', jsonb_build_object(
      'active', false,
      'message', 'System Maintenance Scheduled for 2 AM.',
      'type', 'INFO'
    ),
    'pricingPlans', jsonb_build_array(
      jsonb_build_object(
        'id', 'p1',
        'name', 'Free',
        'priceConfig', jsonb_build_object('type', 'free', 'monthly', 0, 'annual', 0),
        'description', 'For small businesses (<5 emp)',
        'limit', '5',
        'features', jsonb_build_array('Basic Payroll', 'Payslip PDF'),
        'cta', 'Start Free',
        'highlight', false,
        'color', 'bg-white',
        'textColor', 'text-gray-900',
        'isActive', true
      ),
      jsonb_build_object(
        'id', 'p2',
        'name', 'Starter',
        'priceConfig', jsonb_build_object('type', 'flat', 'monthly', 5000, 'annual', 50000),
        'description', 'Growing teams needing compliance',
        'limit', '25',
        'features', jsonb_build_array('S01/S02 Reports', 'ACH Bank Files', 'Email Support'),
        'cta', 'Get Started',
        'highlight', true,
        'color', 'bg-jam-black',
        'textColor', 'text-white',
        'isActive', true
      ),
      jsonb_build_object(
        'id', 'p3',
        'name', 'Pro',
        'priceConfig', jsonb_build_object('type', 'per_emp', 'monthly', 500, 'annual', 5000),
        'description', 'Larger organizations',
        'limit', 'Unlimited',
        'features', jsonb_build_array('GL Integration', 'Employee Portal', 'Advanced HR'),
        'cta', 'Get Started',
        'highlight', false,
        'color', 'bg-white',
        'textColor', 'text-gray-900',
        'isActive', true
      ),
      jsonb_build_object(
        'id', 'p4',
        'name', 'Reseller',
        'priceConfig', jsonb_build_object(
          'type', 'base',
          'monthly', 0,
          'annual', 0,
          'baseFee', 5000,
          'perUserFee', 500,
          'resellerCommission', 20
        ),
        'description', 'For Accountants & Payroll Bureaus',
        'limit', 'Unlimited',
        'features', jsonb_build_array('White Label', 'Client Management', '20% Commission'),
        'cta', 'Get Started',
        'highlight', false,
        'color', 'bg-gray-100',
        'textColor', 'text-gray-900',
        'isActive', true
      )
    )
  ),
  NOW()
)
ON CONFLICT (id) DO NOTHING;  -- Don't overwrite if already exists

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_global_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS global_config_updated_at ON global_config;
CREATE TRIGGER global_config_updated_at
  BEFORE UPDATE ON global_config
  FOR EACH ROW
  EXECUTE FUNCTION update_global_config_timestamp();

-- Create index for faster access (though there's only one row)
CREATE INDEX IF NOT EXISTS idx_global_config_updated_at ON global_config(updated_at DESC);
