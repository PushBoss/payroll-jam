-- Migration: Remove unique constraint on pay_runs to allow multiple pay runs for the same period
-- This allows users to create multiple pay runs (especially drafts) for the same period

-- Drop the existing unique constraint
ALTER TABLE pay_runs DROP CONSTRAINT IF EXISTS unique_pay_run_period;

-- Optional: Add a partial unique constraint that only applies to FINALIZED pay runs
-- This prevents duplicate finalized pay runs but allows multiple drafts
-- Comment out the line below if you want to allow multiple finalized runs as well
-- ALTER TABLE pay_runs ADD CONSTRAINT unique_finalized_pay_run_period 
--   UNIQUE (company_id, period_start, period_end, pay_frequency, status) 
--   WHERE status = 'FINALIZED';

-- Add an index to improve query performance when looking up pay runs by period
CREATE INDEX IF NOT EXISTS idx_pay_runs_period ON pay_runs(company_id, period_start, period_end, pay_frequency);

-- Add a comment to the table explaining the change
COMMENT ON TABLE pay_runs IS 'Pay run records. Multiple pay runs can exist for the same period to support drafts and revisions.';
