-- SQL Script to Verify All RPC Functions from manual_functions.txt
-- Run this in your Supabase SQL Editor to check which functions exist

-- Check all functions and return their existence status
SELECT 
    routine_name as function_name,
    routine_type,
    CASE 
        WHEN routine_type = 'FUNCTION' THEN 'EXISTS'
        ELSE 'NOT FOUND'
    END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    -- TRANSACTION & CATEGORY MANAGEMENT
    'update_transaction_category_by_name',
    'update_similar_transactions_by_name',
    'get_affected_transaction_ids',
    'create_or_update_category_rule',
    
    -- FINANCIAL ANALYTICS & REPORTING
    'get_net_worth',
    'get_investment_snapshot',
    'get_recent_transactions',
    'get_spend_by_category',
    'get_cashflow_monthly',
    'get_spend_by_merchant',
    'get_transactions_by_category',
    'get_spend_summary',
    'get_spend_by_month',
    'get_spend_by_category_periods',
    
    -- GOALS & INVESTMENT TRACKING
    'get_goals_overview',
    'get_investment_portfolio_summary',
    'get_investment_holdings_detailed',
    'get_investment_balances_summary',
    'get_investment_connections',
    'get_investment_overview',
    
    -- GOALS MANAGEMENT
    'increment_goal_amount',
    
    -- RECURRING TRANSACTIONS
    'get_recurring_streams_active',
    'get_recurring_next_dates',
    
    -- ACCOUNT MANAGEMENT
    'delete_account_and_related_data',
    
    -- SYNC & STATUS MANAGEMENT
    'get_user_sync_status',
    
    -- SECURITY & CREDENTIAL MANAGEMENT
    'secure_get_plaid_token',
    'secure_store_plaid_token',
    'secure_delete_plaid_token',
    'secure_store_snaptrade_credentials',
    
    -- AUTOMATIC CATEGORIZATION FUNCTIONS
    'apply_category_rules_to_existing_transactions',
    'auto_apply_category_rules',
    
    -- UTILITY & TRIGGER FUNCTIONS
    'update_updated_at_column',
    'update_web_scrape_cache_updated_at',
    'set_updated_at',
    'category_groupings_set_updated_at',
    'update_context_cache_updated_at',
    'update_reports_updated_at',
    'calculate_total_percent_change',
    'trg_transactions_if_recurring_sync',
    'prevent_merchant_name_mutation',
    'sync_profile_to_memories',
    
    -- CHAT HISTORY MANAGEMENT
    'get_user_chat_sessions',
    'save_chat_session',
    'get_chat_session_messages',
    
    -- ONBOARDING ANALYTICS
    'log_onboarding_event',
    
    -- CLEANUP & MAINTENANCE FUNCTIONS
    'cleanup_expired_context_cache',
    'cleanup_expired_conversation_context',
    'cleanup_orphaned_plaid_secrets',
    
    -- USER MANAGEMENT
    'hard_delete_user'
)
ORDER BY routine_name;

-- Detailed check with parameters for each function
-- TRANSACTION & CATEGORY MANAGEMENT
SELECT 'update_transaction_category_by_name' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'update_transaction_category_by_name' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'update_similar_transactions_by_name' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'update_similar_transactions_by_name' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_affected_transaction_ids' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_affected_transaction_ids' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'create_or_update_category_rule' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'create_or_update_category_rule' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- FINANCIAL ANALYTICS & REPORTING
SELECT 'get_net_worth' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_net_worth' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_investment_snapshot' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_investment_snapshot' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_recent_transactions' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_recent_transactions' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_spend_by_category' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_spend_by_category' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_cashflow_monthly' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_cashflow_monthly' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_spend_by_merchant' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_spend_by_merchant' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_transactions_by_category' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_transactions_by_category' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_spend_summary' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_spend_summary' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_spend_by_month' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_spend_by_month' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_spend_by_category_periods' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_spend_by_category_periods' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- GOALS & INVESTMENT TRACKING
SELECT 'get_goals_overview' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_goals_overview' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_investment_portfolio_summary' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_investment_portfolio_summary' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_investment_holdings_detailed' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_investment_holdings_detailed' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_investment_balances_summary' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_investment_balances_summary' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_investment_connections' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_investment_connections' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_investment_overview' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_investment_overview' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- GOALS MANAGEMENT
SELECT 'increment_goal_amount' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'increment_goal_amount' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- RECURRING TRANSACTIONS
SELECT 'get_recurring_streams_active' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_recurring_streams_active' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_recurring_next_dates' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_recurring_next_dates' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- ACCOUNT MANAGEMENT
SELECT 'delete_account_and_related_data' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'delete_account_and_related_data' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- SYNC & STATUS MANAGEMENT
SELECT 'get_user_sync_status' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_user_sync_status' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- SECURITY & CREDENTIAL MANAGEMENT
SELECT 'secure_get_plaid_token' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'secure_get_plaid_token' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'secure_store_plaid_token' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'secure_store_plaid_token' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'secure_delete_plaid_token' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'secure_delete_plaid_token' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'secure_store_snaptrade_credentials' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'secure_store_snaptrade_credentials' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- AUTOMATIC CATEGORIZATION FUNCTIONS
SELECT 'apply_category_rules_to_existing_transactions' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'apply_category_rules_to_existing_transactions' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'auto_apply_category_rules' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'auto_apply_category_rules' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- UTILITY & TRIGGER FUNCTIONS
SELECT 'update_updated_at_column' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'update_updated_at_column' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'update_web_scrape_cache_updated_at' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'update_web_scrape_cache_updated_at' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'set_updated_at' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'set_updated_at' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'category_groupings_set_updated_at' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'category_groupings_set_updated_at' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'update_context_cache_updated_at' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'update_context_cache_updated_at' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'update_reports_updated_at' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'update_reports_updated_at' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'calculate_total_percent_change' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'calculate_total_percent_change' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'trg_transactions_if_recurring_sync' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'trg_transactions_if_recurring_sync' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'prevent_merchant_name_mutation' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'prevent_merchant_name_mutation' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'sync_profile_to_memories' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'sync_profile_to_memories' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- CHAT HISTORY MANAGEMENT
SELECT 'get_user_chat_sessions' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_user_chat_sessions' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'save_chat_session' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'save_chat_session' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'get_chat_session_messages' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'get_chat_session_messages' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- ONBOARDING ANALYTICS
SELECT 'log_onboarding_event' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'log_onboarding_event' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- CLEANUP & MAINTENANCE FUNCTIONS
SELECT 'cleanup_expired_context_cache' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'cleanup_expired_context_cache' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'cleanup_expired_conversation_context' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'cleanup_expired_conversation_context' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

SELECT 'cleanup_orphaned_plaid_secrets' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'cleanup_orphaned_plaid_secrets' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- USER MANAGEMENT
SELECT 'hard_delete_user' as function_name, 
       COUNT(*) as exists_count,
       pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname = 'hard_delete_user' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY oid;

-- Summary: List all missing functions
SELECT 
    'MISSING FUNCTIONS' as check_type,
    function_name
FROM (
    VALUES 
    ('update_transaction_category_by_name'),
    ('update_similar_transactions_by_name'),
    ('get_affected_transaction_ids'),
    ('create_or_update_category_rule'),
    ('get_net_worth'),
    ('get_investment_snapshot'),
    ('get_recent_transactions'),
    ('get_spend_by_category'),
    ('get_cashflow_monthly'),
    ('get_spend_by_merchant'),
    ('get_transactions_by_category'),
    ('get_spend_summary'),
    ('get_spend_by_month'),
    ('get_spend_by_category_periods'),
    ('get_goals_overview'),
    ('get_investment_portfolio_summary'),
    ('get_investment_holdings_detailed'),
    ('get_investment_balances_summary'),
    ('get_investment_connections'),
    ('get_investment_overview'),
    ('increment_goal_amount'),
    ('get_recurring_streams_active'),
    ('get_recurring_next_dates'),
    ('delete_account_and_related_data'),
    ('get_user_sync_status'),
    ('secure_get_plaid_token'),
    ('secure_store_plaid_token'),
    ('secure_delete_plaid_token'),
    ('secure_store_snaptrade_credentials'),
    ('apply_category_rules_to_existing_transactions'),
    ('auto_apply_category_rules'),
    ('update_updated_at_column'),
    ('update_web_scrape_cache_updated_at'),
    ('set_updated_at'),
    ('category_groupings_set_updated_at'),
    ('update_context_cache_updated_at'),
    ('update_reports_updated_at'),
    ('calculate_total_percent_change'),
    ('trg_transactions_if_recurring_sync'),
    ('prevent_merchant_name_mutation'),
    ('sync_profile_to_memories'),
    ('get_user_chat_sessions'),
    ('save_chat_session'),
    ('get_chat_session_messages'),
    ('log_onboarding_event'),
    ('cleanup_expired_context_cache'),
    ('cleanup_expired_conversation_context'),
    ('cleanup_orphaned_plaid_secrets'),
    ('hard_delete_user')
) AS expected_functions(function_name)
WHERE function_name NOT IN (
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
)
ORDER BY function_name;

