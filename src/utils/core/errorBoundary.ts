import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";

// Global error handler for auth-related errors
export const setupGlobalErrorHandling = () => {
  // Intercept Supabase auth errors globally
  const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
  
  supabase.auth.getUser = async () => {
    try {
      const result = await originalGetUser();
      if (result.error) {
        // If user JWT is invalid, silently sign out
        if (
          result.error.message?.includes("User from sub claim in JWT does not exist") ||
          result.error.message?.includes("JWT expired")
        ) {
          logger.info("🔒 Invalid JWT detected, signing out silently");
          await supabase.auth.signOut();
          return { data: { user: null }, error: null };
        }
      }
      return result;
    } catch (error) {
      logger.error("Error in getUser:", error);
      return { data: { user: null }, error: error as any };
    }
  };
};

