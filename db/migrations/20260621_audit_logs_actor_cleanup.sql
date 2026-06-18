-- Allow deleting test/users while retaining audit log history.
-- Older databases may have audit_logs.actor_id pointing at app_users(id)
-- without ON DELETE SET NULL, which blocks app_users cleanup.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE public.audit_logs
      ALTER COLUMN actor_id DROP NOT NULL;
  END IF;
END $$;

DO $$
DECLARE
  existing_constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name
  INTO existing_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'audit_logs'
    AND kcu.column_name = 'actor_id'
    AND ccu.table_schema = 'public'
    AND ccu.table_name = 'app_users'
    AND ccu.column_name = 'id'
  LIMIT 1;

  IF existing_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', existing_constraint_name);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'actor_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_actor_id_fkey
      FOREIGN KEY (actor_id)
      REFERENCES public.app_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;
