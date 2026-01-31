-- RPC Function: mark_transactions_reviewed
-- Marks transactions as reviewed (single or bulk)
-- Parameters:
--   p_user_id: User ID (automatically set from auth.uid() if not provided)
--   p_transaction_ids: Optional array of transaction IDs to mark as reviewed
--                      If NULL, marks all unreviewed transactions for the user
-- Returns: Integer count of updated transactions

CREATE OR REPLACE FUNCTION public.mark_transactions_reviewed(
  p_user_id uuid DEFAULT auth.uid(),
  p_transaction_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Verify user is authenticated
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Mark transactions as reviewed
  IF p_transaction_ids IS NULL THEN
    -- Mark all unreviewed transactions for the user
    UPDATE public.transactions
    SET is_reviewed = true
    WHERE user_id = p_user_id
      AND is_reviewed = false;
  ELSE
    -- Mark specific transactions (only if they belong to the user)
    UPDATE public.transactions
    SET is_reviewed = true
    WHERE user_id = p_user_id
      AND id = ANY(p_transaction_ids)
      AND is_reviewed = false;
  END IF;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.mark_transactions_reviewed(uuid, uuid[]) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.mark_transactions_reviewed IS 'Marks transactions as reviewed. If p_transaction_ids is NULL, marks all unreviewed transactions for the user. Returns count of updated transactions.';
