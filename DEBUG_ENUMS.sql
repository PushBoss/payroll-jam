-- FIX: DISCOVER ALL ENUM VALUES
SELECT 
    n.nspname AS schema_name,
    t.typname AS enum_name, 
    e.enumlabel AS enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY enum_name, enum_value;

-- ALSO CHECK THE TABLE COLUMN TYPE DIRECTLY
SELECT column_name, udt_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'account_members' 
  AND column_name = 'role';
