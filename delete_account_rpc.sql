-- RPC function to delete an account and all its related data
-- Returns information about whether the associated item should also be deleted

CREATE OR REPLACE FUNCTION delete_account_and_related_data(
  p_account_id TEXT,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id TEXT;
  v_remaining_accounts INTEGER;
  v_deleted_account RECORD;
BEGIN
  -- Verify the account exists and belongs to the user
  SELECT a.item_id INTO v_item_id
  FROM accounts a
  JOIN user_items ui ON a.item_id = ui.item_id
  WHERE a.account_id = p_account_id AND ui.user_id = p_user_id;
  
  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Account not found or does not belong to user';
  END IF;
  
  -- Store account info before deletion
  SELECT * INTO v_deleted_account
  FROM accounts
  WHERE account_id = p_account_id;
  
  -- Delete transactions associated with this account
  DELETE FROM transactions
  WHERE account_id = p_account_id AND user_id = p_user_id;
  
  -- Delete recurring streams associated with this account
  DELETE FROM recurring_streams
  WHERE account_id = p_account_id AND user_id = p_user_id;
  
  -- Delete the account itself
  DELETE FROM accounts
  WHERE account_id = p_account_id;
  
  -- Count remaining accounts for the same item_id
  SELECT COUNT(*) INTO v_remaining_accounts
  FROM accounts
  WHERE item_id = v_item_id;
  
  -- Return result indicating if item should be deleted
  RETURN json_build_object(
    'should_delete_item', v_remaining_accounts = 0,
    'item_id', v_item_id,
    'remaining_accounts', v_remaining_accounts,
    'deleted_account_name', v_deleted_account.name,
    'deleted_account_mask', v_deleted_account.mask
  );
END;
$$;

