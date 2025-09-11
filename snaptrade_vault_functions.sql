-- SnapTrade Vault Functions
-- Execute these commands in your Supabase SQL editor

-- Function to securely store SnapTrade credentials in Vault
CREATE OR REPLACE FUNCTION secure_store_snaptrade_credentials(
  p_user_id uuid,
  p_snaptrade_user_id text,
  p_account_id text,
  p_user_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id uuid;
BEGIN
  -- Store the user_secret in Vault
  INSERT INTO vault.secrets (name, secret)
  VALUES (
    'snaptrade_user_secret_' || p_user_id::text || '_' || p_snaptrade_user_id || '_' || p_account_id,
    p_user_secret
  )
  RETURNING id INTO secret_id;
  
  RETURN secret_id;
END;
$$;

-- Function to securely retrieve SnapTrade credentials from Vault
CREATE OR REPLACE FUNCTION secure_get_snaptrade_credentials(
  p_user_id uuid,
  p_snaptrade_user_id text,
  p_account_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_secret text;
BEGIN
  -- Get the user_secret from Vault
  SELECT secret INTO user_secret
  FROM vault.secrets
  WHERE name = 'snaptrade_user_secret_' || p_user_id::text || '_' || p_snaptrade_user_id || '_' || p_account_id;
  
  RETURN user_secret;
END;
$$;

-- Function to delete SnapTrade credentials from Vault
CREATE OR REPLACE FUNCTION secure_delete_snaptrade_credentials(
  p_user_id uuid,
  p_snaptrade_user_id text,
  p_account_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete the user_secret from Vault
  DELETE FROM vault.secrets
  WHERE name = 'snaptrade_user_secret_' || p_user_id::text || '_' || p_snaptrade_user_id || '_' || p_account_id;
  
  RETURN FOUND;
END;
$$;
