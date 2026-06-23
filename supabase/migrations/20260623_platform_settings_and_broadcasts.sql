-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id integer PRIMARY KEY DEFAULT 1,
  current_version text,
  latest_release_notes text,
  updated_at timestamp with time zone DEFAULT now(),
  -- Ensure only one row exists
  CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize the single row if it doesn't exist
INSERT INTO system_settings (id, current_version, latest_release_notes)
VALUES (1, '1.0.0', 'Initial Setup')
ON CONFLICT (id) DO NOTHING;

-- Set up RLS for system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can read or update system settings
CREATE POLICY "Super admins can view system settings" 
  ON system_settings FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE app_users.id = auth.uid() 
      AND app_users.role = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "Super admins can update system settings" 
  ON system_settings FOR UPDATE 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE app_users.id = auth.uid() 
      AND app_users.role = 'SUPER_ADMIN'
    )
  );


-- Create system_broadcasts table
CREATE TABLE IF NOT EXISTS system_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_markdown text NOT NULL,
  target_audience text NOT NULL CHECK (target_audience IN ('ALL_USERS', 'OWNERS_ONLY')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENDING', 'COMPLETED')),
  created_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone
);

-- Set up RLS for system_broadcasts
ALTER TABLE system_broadcasts ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage broadcasts
CREATE POLICY "Super admins can view broadcasts" 
  ON system_broadcasts FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE app_users.id = auth.uid() 
      AND app_users.role = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "Super admins can insert broadcasts" 
  ON system_broadcasts FOR INSERT 
  TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE app_users.id = auth.uid() 
      AND app_users.role = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "Super admins can update broadcasts" 
  ON system_broadcasts FOR UPDATE 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE app_users.id = auth.uid() 
      AND app_users.role = 'SUPER_ADMIN'
    )
  );
