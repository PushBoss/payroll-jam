-- Version 1.0.4: Growth analytics and acquisition tracking

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT;

ALTER TABLE public.global_config
  ADD COLUMN IF NOT EXISTS monthly_signup_goal INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_acquisition_source_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_acquisition_source_check
      CHECK (
        acquisition_source IS NULL
        OR acquisition_source IN ('Google Search', 'Word of Mouth / Referral', 'Social Media', 'Other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_acquisition_source_check'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_acquisition_source_check
      CHECK (
        acquisition_source IS NULL
        OR acquisition_source IN ('Google Search', 'Word of Mouth / Referral', 'Social Media', 'Other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'global_config_monthly_signup_goal_check'
  ) THEN
    ALTER TABLE public.global_config
      ADD CONSTRAINT global_config_monthly_signup_goal_check
      CHECK (monthly_signup_goal >= 1);
  END IF;
END $$;

UPDATE public.global_config
SET
  monthly_signup_goal = COALESCE(
    CASE
      WHEN COALESCE(config->>'monthlySignupGoal', '') ~ '^[0-9]+$' THEN (config->>'monthlySignupGoal')::INTEGER
      ELSE NULL
    END,
    monthly_signup_goal,
    10
  ),
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{monthlySignupGoal}',
    to_jsonb(COALESCE(
      CASE
        WHEN COALESCE(config->>'monthlySignupGoal', '') ~ '^[0-9]+$' THEN (config->>'monthlySignupGoal')::INTEGER
        ELSE NULL
      END,
      monthly_signup_goal,
      10
    )),
    true
  )
WHERE id = 'platform';

UPDATE public.companies
SET acquisition_source = COALESCE(
  acquisition_source,
  NULLIF(settings->>'acquisitionSource', ''),
  NULLIF(settings #>> '{signupDetails,acquisitionSource}', '')
)
WHERE acquisition_source IS NULL
  AND (
    NULLIF(settings->>'acquisitionSource', '') IS NOT NULL
    OR NULLIF(settings #>> '{signupDetails,acquisitionSource}', '') IS NOT NULL
  );

UPDATE public.app_users u
SET acquisition_source = c.acquisition_source
FROM public.companies c
WHERE u.company_id = c.id
  AND u.acquisition_source IS NULL
  AND c.acquisition_source IS NOT NULL;
