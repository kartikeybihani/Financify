-- Create sync_logs table for tracking automated sync operations
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' or 'manual'
  total_items INTEGER NOT NULL DEFAULT 0,
  successful_syncs INTEGER NOT NULL DEFAULT 0,
  failed_syncs INTEGER NOT NULL DEFAULT 0,
  error_details JSONB DEFAULT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);

-- Add sync status columns to user_items table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_items' AND column_name = 'last_automated_sync') THEN
        ALTER TABLE user_items ADD COLUMN last_automated_sync TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_items' AND column_name = 'sync_status') THEN
        ALTER TABLE user_items ADD COLUMN sync_status TEXT DEFAULT 'pending';
    END IF;
END $$;

-- Create function to get latest sync status for a user
CREATE OR REPLACE FUNCTION get_user_sync_status(p_user_id UUID)
RETURNS TABLE (
  last_sync TIMESTAMP WITH TIME ZONE,
  sync_status TEXT,
  last_automated_sync TIMESTAMP WITH TIME ZONE,
  total_items INTEGER,
  successful_syncs INTEGER,
  failed_syncs INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ui.last_synced_at,
    ui.sync_status,
    ui.last_automated_sync,
    sl.total_items,
    sl.successful_syncs,
    sl.failed_syncs
  FROM user_items ui
  LEFT JOIN sync_logs sl ON sl.created_at = (
    SELECT MAX(created_at) 
    FROM sync_logs 
    WHERE sync_type = 'scheduled'
  )
  WHERE ui.user_id = p_user_id
  AND ui.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
