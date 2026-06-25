-- Allow any authenticated user to view the system settings (for current version display)
DROP POLICY IF EXISTS "Super admins can view system settings" ON system_settings;

CREATE POLICY "Anyone can view system settings" 
  ON system_settings FOR SELECT 
  TO authenticated 
  USING (true);
