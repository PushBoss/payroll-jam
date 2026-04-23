-- 2026-04-23
-- Migrate any remaining global config from companies.settings.globalConfig into
-- the authoritative global_config table, then remove the fallback paths from
-- CompanyService.ts that read/write config via the companies table.
--
-- After this migration the runtime ONLY reads from global_config.config and
-- upserts to global_config.  The companies.settings.globalConfig key becomes
-- orphaned data (not removed automatically to avoid unexpected data loss, but
-- it is no longer read or written by the application).

BEGIN;

-- Seed from the most recently updated company that still holds the old config,
-- only if no platform row exists yet (idempotent).
INSERT INTO global_config (id, config, updated_at)
SELECT
    'platform',
    settings->'globalConfig',
    COALESCE(updated_at, NOW())
FROM public.companies
WHERE  (settings ? 'globalConfig')
  AND  (settings->'globalConfig') IS NOT NULL
  AND  (settings->>'globalConfig') != 'null'
ORDER BY updated_at DESC NULLS LAST
LIMIT  1
ON CONFLICT (id) DO NOTHING;

-- Clarify the table's role for future maintainers
COMMENT ON TABLE global_config IS
    'Authoritative platform-wide configuration (pricing plans, payment gateway, email, etc.). '
    'Fallback reads and writes to companies.settings.globalConfig were removed 2026-04-23. '
    'Use this table as the single source of truth.';

COMMIT;
