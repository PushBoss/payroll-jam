SELECT 
    table_name,
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name IN ('app_users', 'companies')
ORDER BY table_name, ordinal_position;
