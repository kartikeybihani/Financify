// app/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/logger";

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Dedupe auth events across the component lifecycle
  const lastEventRef = useRef<string>("");
  const lastUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Get initial session and validate user exists
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Validate that the user actually exists in the database
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error || !user) {
          logger.error(
            "❌ Session exists but user invalid, signing out:",
            error?.message
          );
          await supabase.auth.signOut();
          await clearAllCache();
          setSession(null);
          setIsLoading(false);
          return;
        }
      }
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const userId = session?.user?.id;
      if (lastEventRef.current === event && lastUserIdRef.current === userId) {
        // Ignore duplicate auth event to avoid loops
        return;
      }
      lastEventRef.current = event;
      lastUserIdRef.current = userId;

      logger.info(`🔐 Auth state changed: ${event}`);

      // Handle invalid user errors
      if (event === "TOKEN_REFRESHED" && session) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error || !user) {
          logger.error("❌ User from JWT does not exist, force sign out");
          await supabase.auth.signOut();
          await clearAllCache();
          setSession(null);
          return;
        }
      }

      // INITIAL_SESSION may fire with null session; do not treat as sign-out
      setSession(session);
      setIsLoading(false);

      // Clear cache ONLY on explicit sign out
      if (event === "SIGNED_OUT") {
        await clearAllCache();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearAllCache = async () => {
    try {
      await AsyncStorage.multiRemove([
        "onboarding_complete",
        "user_authenticated",
        "userData",
        "onboarding_started",
        "@goals_cache",
        "@cash_cache",
        "@balances_cache",
        "@recurring_cache",
        "@investment_cache",
      ]);
      logger.info("🗑️ Cleared all cache on sign out");
    } catch (e) {
      logger.error("Error clearing cache:", e);
    }
  };

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
