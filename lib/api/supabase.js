// /lib/api/supabase.js
// Shared Supabase client initialization for all API routes
import { createClient } from "@supabase/supabase-js";

// Use service role key for backend operations (bypasses RLS)
// Includes fallback to EXPO_PUBLIC_ vars for compatibility
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Export URL and key for use in fetch calls to Supabase functions
export { supabaseUrl, supabaseServiceKey };
