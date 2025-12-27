-- Quick check if get_transactions_by_category exists
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as parameters,
    pg_get_function_result(oid) as return_type,
    CASE WHEN proname IS NOT NULL THEN 'EXISTS' ELSE 'NOT FOUND' END as status
FROM pg_proc 
WHERE proname = 'get_transactions_by_category' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Get the full function code
SELECT 
    proname as function_name,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'get_transactions_by_category' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Debug: Check what categories actually exist in transactions table
SELECT DISTINCT 
    COALESCE(new_category, top_category, sub_category, 'uncategorized') as category,
    COUNT(*) as transaction_count
FROM public.transactions
WHERE user_id = 'f948c4ab-dc68-41d5-89bf-1935653cca37'::uuid
GROUP BY COALESCE(new_category, top_category, sub_category, 'uncategorized')
ORDER BY transaction_count DESC;

-- Debug: Check if Food category exists (case-insensitive)
SELECT DISTINCT 
    COALESCE(new_category, top_category, sub_category, 'uncategorized') as category,
    COUNT(*) as transaction_count
FROM public.transactions
WHERE user_id = 'f948c4ab-dc68-41d5-89bf-1935653cca37'::uuid
    AND LOWER(COALESCE(new_category, top_category, sub_category, 'uncategorized')) LIKE '%food%'
GROUP BY COALESCE(new_category, top_category, sub_category, 'uncategorized');

-- Debug: Test the function directly with exact parameters
SELECT * FROM public.get_transactions_by_category(
    'f948c4ab-dc68-41d5-89bf-1935653cca37'::uuid,
    'Food',
    '2024-06-23'::date,
    '2024-12-23'::date
);

-- Debug: Test with different category name variations
SELECT 'Food' as category_name, COUNT(*) as count FROM public.get_transactions_by_category(
    'f948c4ab-dc68-41d5-89bf-1935653cca37'::uuid, 'Food', '2024-06-23'::date, '2024-12-23'::date
)
UNION ALL
SELECT 'food', COUNT(*) FROM public.get_transactions_by_category(
    'f948c4ab-dc68-41d5-89bf-1935653cca37'::uuid, 'food', '2024-06-23'::date, '2024-12-23'::date
)
UNION ALL
SELECT 'FOOD', COUNT(*) FROM public.get_transactions_by_category(
    'f948c4ab-dc68-41d5-89bf-1935653cca37'::uuid, 'FOOD', '2024-06-23'::date, '2024-12-23'::date
);

