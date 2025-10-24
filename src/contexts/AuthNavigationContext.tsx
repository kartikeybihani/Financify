import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/logger";

// Navigation states - the 4 main stages
export enum NavigationState {
  PRE_SIGNUP = "pre_signup",
  ONBOARDING = "onboarding",
  ONBOARDING_FINAL = "onboarding_final",
  AUTHENTICATED = "authenticated",
}

interface Profile {
  onboarding_completed: boolean;
  onboarding_step: number;
}

interface AuthNavigationContextType {
  // Auth state
  session: Session | null;
  user: Session["user"] | null;

  // Navigation state
  navigationState: NavigationState;
  onboardingStep: number;
  onboardingCompleted: boolean;

  // Loading state (single source of truth)
  isLoading: boolean;

  // Actions
  refreshNavigationState: () => Promise<void>;
}

const AuthNavigationContext = createContext<
  AuthNavigationContextType | undefined
>(undefined);

interface AuthNavigationProviderProps {
  children: ReactNode;
}

export const AuthNavigationProvider: React.FC<AuthNavigationProviderProps> = ({
  children,
}) => {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Navigation state
  const [navigationState, setNavigationState] = useState<NavigationState>(
    NavigationState.PRE_SIGNUP
  );
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  // Cache profile data in memory to avoid repeated DB calls
  const profileCache = useRef<Profile | null>(null);
  const profileCacheUserId = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  // Deduplication for auth events
  const lastAuthEventRef = useRef<string>("");
  const lastUserIdRef = useRef<string | undefined>(undefined);

  /**
   * Fetch profile data from database
   * Only called when needed (session changes, explicit refresh)
   */
  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("onboarding_completed, onboarding_step")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        logger.error("Error fetching profile:", error);
        return null;
      }

      // Legacy users without profile row = treat as completed
      if (!profile) {
        return { onboarding_completed: true, onboarding_step: 0 };
      }

      return {
        onboarding_completed: !!profile.onboarding_completed,
        onboarding_step: Number(profile.onboarding_step || 0),
      };
    } catch (error) {
      logger.error("Error in fetchProfile:", error);
      return null;
    }
  };

  /**
   * Determine navigation state based on session and profile
   */
  const determineNavigationState = (
    hasSession: boolean,
    profile: Profile | null
  ): NavigationState => {
    // No session = pre-signup
    if (!hasSession) {
      return NavigationState.PRE_SIGNUP;
    }

    // No profile data = treat as completed (legacy users)
    if (!profile) {
      return NavigationState.AUTHENTICATED;
    }

    // Completed onboarding = authenticated
    if (profile.onboarding_completed) {
      return NavigationState.AUTHENTICATED;
    }

    // Step 4 = final screen (onboarding-complete)
    if (profile.onboarding_step === 4) {
      return NavigationState.ONBOARDING_FINAL;
    }

    // Otherwise = onboarding
    return NavigationState.ONBOARDING;
  };

  /**
   * Update navigation state based on current session
   */
  const updateNavigationState = async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      // No session = clear everything
      profileCache.current = null;
      profileCacheUserId.current = null;
      setNavigationState(NavigationState.PRE_SIGNUP);
      setOnboardingStep(0);
      setOnboardingCompleted(false);
      return;
    }

    // Fetch profile if not cached or user changed
    const userId = currentSession.user.id;
    if (!profileCache.current || profileCacheUserId.current !== userId) {
      const profile = await fetchProfile(userId);
      profileCache.current = profile;
      profileCacheUserId.current = userId;
    }

    const profile = profileCache.current;
    const newState = determineNavigationState(true, profile);

    setNavigationState(newState);
    setOnboardingStep(profile?.onboarding_step || 0);
    setOnboardingCompleted(profile?.onboarding_completed || false);
  };

  /**
   * Clear all app cache on sign out
   */
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
      profileCache.current = null;
      profileCacheUserId.current = null;
    } catch (error) {
      logger.error("Error clearing cache:", error);
    }
  };

  /**
   * Public method to refresh navigation state
   * Useful when onboarding state changes
   */
  const refreshNavigationState = async () => {
    if (session?.user) {
      // Force refetch profile
      profileCache.current = null;
      profileCacheUserId.current = null;
      await updateNavigationState(session);
    }
  };

  /**
   * Initialize auth state
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Get initial session
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (initialSession) {
          // Validate user exists
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser();

          if (error || !user) {
            logger.error("Invalid session, signing out:", error?.message);
            await supabase.auth.signOut();
            await clearAllCache();
            setSession(null);
            setIsAuthLoading(false);
            return;
          }

          setSession(initialSession);
          await updateNavigationState(initialSession);
        } else {
          setSession(null);
          setNavigationState(NavigationState.PRE_SIGNUP);
        }

        setIsAuthLoading(false);
        isInitializedRef.current = true;
      } catch (error) {
        logger.error("Error initializing auth:", error);
        setIsAuthLoading(false);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Listen for auth state changes
   */
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const userId = newSession?.user?.id;

      // Deduplicate events
      if (
        lastAuthEventRef.current === event &&
        lastUserIdRef.current === userId
      ) {
        return;
      }

      lastAuthEventRef.current = event;
      lastUserIdRef.current = userId;

      logger.info(`🔐 Auth: ${event}`);

      // Handle token refresh - validate user still exists with retry logic
      if (event === "TOKEN_REFRESHED" && newSession) {
        // Add delay to ensure Supabase has fully updated the session
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Retry logic for getUser() to handle race conditions
        let user = null;
        let error = null;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          const result = await supabase.auth.getUser();
          user = result.data.user;
          error = result.error;

          if (user?.id || error) {
            break; // Success or permanent error
          }

          retryCount++;
          if (retryCount < maxRetries) {
            logger.info(
              `🔄 [AUTH] Token refresh retry ${retryCount}/${maxRetries}`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 200 * retryCount)
            );
          }
        }

        if (error || !user?.id) {
          logger.error(
            "Invalid user on token refresh after retries, signing out"
          );

          // Direct sign out - don't try to validate again as it will fail
          await supabase.auth.signOut();
          await clearAllCache();
          setSession(null);
          return;
        }

        // Emit event to notify components about token refresh with validated session
        DeviceEventEmitter.emit("authStateChanged", {
          event,
          session: newSession,
          validated: true,
        });

        // Also update navigation state to ensure UI is in sync
        await updateNavigationState(newSession);
      }

      // Update session
      setSession(newSession);

      // Update navigation state (silently - no loading screen during auth events)
      // Login/signup screens handle their own loading and navigation
      // This just keeps the context state in sync
      if (isInitializedRef.current) {
        await updateNavigationState(newSession);
      }

      // Clear cache on explicit sign out
      if (event === "SIGNED_OUT") {
        await clearAllCache();
        logger.info("🚪 Signed out and cleared cache");
      }

      // Log successful sign in
      if (event === "SIGNED_IN" && newSession?.user) {
        logger.info(`User logged in: ${newSession.user.email}`);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const contextValue: AuthNavigationContextType = {
    session,
    user: session?.user || null,
    navigationState,
    onboardingStep,
    onboardingCompleted,
    isLoading: isAuthLoading,
    refreshNavigationState,
  };

  return (
    <AuthNavigationContext.Provider value={contextValue}>
      {children}
    </AuthNavigationContext.Provider>
  );
};

/**
 * Hook to use auth and navigation context
 */
export const useAuthNavigation = (): AuthNavigationContextType => {
  const context = useContext(AuthNavigationContext);
  if (context === undefined) {
    throw new Error(
      "useAuthNavigation must be used within an AuthNavigationProvider"
    );
  }
  return context;
};

// Backwards compatibility exports
export const useAuth = useAuthNavigation;
export const useNavigationContext = useAuthNavigation;

export default AuthNavigationProvider;
