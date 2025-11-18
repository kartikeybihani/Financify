import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";

/**
 * Robust getUser function that handles race conditions during token refresh
 * @param retries Number of retries if user is not found
 * @param delay Delay between retries in milliseconds
 * @returns Promise with user data or null
 */
export async function getAuthenticatedUser(
  retries: number = 2,
  delay: number = 100
): Promise<{ user: any; error: any } | null> {
  let retryCount = 0;
  
  while (retryCount <= retries) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (user?.id) {
        return { user, error: null };
      }
      
      if (error) {
        logger.error(`❌ [AUTH] getUser error on attempt ${retryCount + 1}:`, error);
        return { user: null, error };
      }
      
      // User is null but no error - this might be a race condition
      if (retryCount < retries) {
        logger.info(`🔄 [AUTH] User not found on attempt ${retryCount + 1}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, delay * (retryCount + 1)));
      }
      
      retryCount++;
    } catch (err) {
      logger.error(`❌ [AUTH] Unexpected error on attempt ${retryCount + 1}:`, err);
      return { user: null, error: err };
    }
  }
  
  logger.error(`❌ [AUTH] Failed to get authenticated user after ${retries + 1} attempts`);
  return { user: null, error: new Error("User not authenticated after retries") };
}

/**
 * Simple wrapper for backward compatibility
 */
export async function getUserId(): Promise<string | null> {
  const result = await getAuthenticatedUser();
  return result?.user?.id || null;
}
