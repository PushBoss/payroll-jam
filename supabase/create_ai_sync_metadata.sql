-- Run this in your Supabase SQL Editor to track your files for the AI Assistant
CREATE TABLE IF NOT EXISTS ai_sync_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text UNIQUE,
  gemini_file_id text,
  last_synced timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_sync_metadata ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage everything
DROP POLICY IF EXISTS "Service role can manage ai_sync_metadata" ON ai_sync_metadata;
CREATE POLICY "Service role can manage ai_sync_metadata" ON ai_sync_metadata
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
