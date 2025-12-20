# Database Migrations

This folder contains SQL migration files to update your Supabase database schema.

## How to Apply Migrations

### Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of the migration file you want to run
5. Paste it into the SQL editor
6. Click **Run** to execute the migration

### Using Supabase CLI

```bash
supabase db push
```

## Available Migrations

### `remove_pay_run_unique_constraint.sql`

**Status**: ⚠️ Required for latest app version

**What it does**:
- Removes the unique constraint on `(company_id, period_start, period_end, pay_frequency)` from the `pay_runs` table
- Allows users to create multiple pay runs for the same period
- Adds an index to improve query performance
- Fixes duplicate draft issues

**When to apply**: 
- Apply this migration immediately if you're experiencing issues with:
  - Duplicate pay run drafts
  - Errors when creating multiple pay runs for the same period
  - "unique constraint violation" errors

**Rollback**: 
If you need to rollback this migration, run:
```sql
-- Restore the unique constraint (will fail if duplicate pay runs exist)
ALTER TABLE pay_runs ADD CONSTRAINT unique_pay_run_period 
  UNIQUE (company_id, period_start, period_end, pay_frequency);
```

## Notes

- Always backup your database before running migrations
- Test migrations in a staging environment first if possible
- Migrations are designed to be idempotent (safe to run multiple times)
- Check the Supabase logs after applying migrations to verify success
