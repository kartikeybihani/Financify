// app/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../_lib/supabase/supabase";
import logger from "../_utils/logger";

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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setIsLoading(false);

      // Clear cache when user signs out
      if (event === "SIGNED_OUT" || !session) {
        await AsyncStorage.removeItem("onboarding_complete");
        await AsyncStorage.removeItem("user_authenticated");
        await AsyncStorage.removeItem("userData");
        logger.info("🗑️ Cleared AsyncStorage cache on sign out");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
