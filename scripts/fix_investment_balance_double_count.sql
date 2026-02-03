-- One-time fix: correct total_value (and related fields) when they were doubled
-- because "cash" was added on top of holdings that already include SPAXX/sweep.
--
-- For a specific user/account (run after verifying correct total from script or UI):
-- UPDATE investment_balances
-- SET
--   total_value = 2832.12,
--   previous_total_value = 2832.12,
--   day_change = 0,
--   day_change_percent = 0
-- WHERE user_id = '79952f35-b607-40d6-a32e-d81386882eb7'
--   AND account_id = 'f8e95de0-e415-419d-bec0-94684b3ca8f9'
--   AND is_current = true;

-- Example for the user from the report (correct total from script: 2832.12):
UPDATE investment_balances
SET
  total_value = 2832.12,
  previous_total_value = 2832.12,
  day_change = 0,
  day_change_percent = 0
WHERE user_id = '79952f35-b607-40d6-a32e-d81386882eb7'
  AND snaptrade_user_id = 'financify-79952f35-b607-40d6-a32e-d81386882eb7-1757578590719-prm3vc'
  AND account_id = 'f8e95de0-e415-419d-bec0-94684b3ca8f9'
  AND is_current = true;
