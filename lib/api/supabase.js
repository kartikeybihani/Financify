// /lib/api/supabase.js
// Shared Supabase client initialization for all API routes
import { createClient } from "@supabase/supabase-js";

// Use service role key for backend operations (bypasses RLS)
// Includes fallback to EXPO_PUBLIC_ vars for compatibility
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://vfbghyahfrlxkbxtzejw.supabase.co";
const supabaseServiceKey =
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYmdoeWFoZnJseGtieHR6ZWp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTAxMDI0MSwiZXhwIjoyMDYwNTg2MjQxfQ.TwXTh5MEZsOx4Fq0-Evk1SuLGQs1JbUw_y0uP_sdC3s";

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Export URL and key for use in fetch calls to Supabase functions
export { supabaseUrl, supabaseServiceKey };
