-- Simple verification: Check if get_summary_min_composite has auth.uid() in its BEGIN block
-- This checks the actual function body, not comments or called functions

SELECT 
  '=== VERIFICATION ===' as check_type,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%BEGIN%auth.uid()%' 
      OR pg_get_functiondef(oid) LIKE '%IF auth.uid()%'
      OR pg_get_functiondef(oid) LIKE '%auth.uid() IS NULL%'
      OR pg_get_functiondef(oid) LIKE '%auth.uid() <>%'
    THEN '❌ STILL HAS auth.uid() CHECK IN FUNCTION BODY'
    ELSE '✅ NO auth.uid() CHECK IN FUNCTION BODY'
  END as status
FROM pg_proc
WHERE proname = 'get_summary_min_composite'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
