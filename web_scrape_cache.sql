-- Web scrape cache table for storing scraped financial product data
-- This table stores cached web scraping results with TTL support

CREATE TABLE IF NOT EXISTS web_scrape_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data_type TEXT NOT NULL, -- 'creditCard', 'bank', 'investment', 'generic'
  data_json JSONB NOT NULL,
  user_specific BOOLEAN DEFAULT FALSE,
  data_size INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_web_scrape_cache_key ON web_scrape_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_web_scrape_cache_type ON web_scrape_cache(data_type);
CREATE INDEX IF NOT EXISTS idx_web_scrape_cache_created ON web_scrape_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_web_scrape_cache_user_specific ON web_scrape_cache(user_specific);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_web_scrape_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_web_scrape_cache_updated_at
  BEFORE UPDATE ON web_scrape_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_web_scrape_cache_updated_at();

-- RLS policies (if needed)
ALTER TABLE web_scrape_cache ENABLE ROW LEVEL SECURITY;

-- Policy for service role access (for API operations)
CREATE POLICY "Service role can manage web scrape cache" ON web_scrape_cache
  FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users to read their own cached data
CREATE POLICY "Users can read their own cached data" ON web_scrape_cache
  FOR SELECT USING (
    auth.role() = 'authenticated' AND 
    (user_specific = FALSE OR cache_key LIKE 'user_' || auth.uid()::text || '_%')
  );

-- Add comments for documentation
COMMENT ON TABLE web_scrape_cache IS 'Cache for web scraped financial product data with TTL support';
COMMENT ON COLUMN web_scrape_cache.cache_key IS 'Unique key for cache lookup (e.g., creditCard_chase.com)';
COMMENT ON COLUMN web_scrape_cache.data_type IS 'Type of data: creditCard, bank, investment, generic';
COMMENT ON COLUMN web_scrape_cache.data_json IS 'Scraped data stored as JSON';
COMMENT ON COLUMN web_scrape_cache.user_specific IS 'Whether this cache entry is user-specific';
COMMENT ON COLUMN web_scrape_cache.data_size IS 'Size of data in bytes for monitoring';
