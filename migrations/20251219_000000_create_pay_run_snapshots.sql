-- 2025-12-19 00:00:00 UTC
-- Migration: create pay_run_snapshots table
-- Deploy notes:
-- - Run this against your Supabase/Postgres instance.
-- - Using Supabase CLI: `supabase db query migrations/20251219_000000_create_pay_run_snapshots.sql`
-- - Or with psql: `psql <connection-string> -f migrations/20251219_000000_create_pay_run_snapshots.sql`

BEGIN;

-- Adds a lightweight snapshot table for finalized pay runs to store a JSON snapshot
-- and a stable finalized token. This avoids changing the existing `pay_runs` unique
-- constraint while still allowing multiple logical snapshots per period.

CREATE TABLE IF NOT EXISTS pay_run_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pay_run_id UUID NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  finalized_token UUID NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot_data JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_run_snapshots_company ON pay_run_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_run_snapshots_token ON pay_run_snapshots(finalized_token);

-- Optional: Ensure only one snapshot per pay_run_id + finalized_token
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pay_run_snapshot_token ON pay_run_snapshots(pay_run_id, finalized_token);

COMMIT;

-- Down script (manual rollback):
-- DROP INDEX IF EXISTS uniq_pay_run_snapshot_token;
-- DROP INDEX IF EXISTS idx_pay_run_snapshots_token;
-- DROP INDEX IF EXISTS idx_pay_run_snapshots_company;
-- DROP TABLE IF EXISTS pay_run_snapshots;
