-- Check enum values for account_members.role
SELECT
  t.typname as enum_name,
  e.enumlabel as allowed_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_attribute a ON a.atttypid = t.oid
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname = 'account_members' AND a.attname = 'role';
