-- Create a config table for AI settings
CREATE TABLE IF NOT EXISTS ai_config (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage everything
DROP POLICY IF EXISTS "Service role can manage ai_config" ON ai_config;
CREATE POLICY "Service role can manage ai_config" ON ai_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Update ai_sync_metadata to handle File Search IDs
ALTER TABLE ai_sync_metadata ADD COLUMN IF NOT EXISTS gemini_store_id text;
