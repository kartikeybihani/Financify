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
import logger from "@/src/utils/core/logger";

// Constants
const PROFILE_FETCH_TIMEOUT_MS = 8000; // 8 seconds timeout for profile fetch
const TOKEN_REFRESH_RETRY_DELAY_MS = 200;
const TOKEN_REFRESH_MAX_RETRIES = 3;
const INITIALIZATION_BUFFER_MS = 100; // Buffer for initialization completion
const PENDING_REFRESH_STALE_MS = 30000; // 30 seconds - ignore stale queued refreshes

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

  // Queue for TOKEN_REFRESHED events that occur before initialization completes
  const pendingTokenRefreshRef = useRef<{
    session: Session | null;
    timestamp: number;
  } | null>(null);

  // Track if we're currently processing a token refresh to prevent concurrent processing
  const isProcessingTokenRefreshRef = useRef(false);

  // Track if we're currently updating navigation state to prevent concurrent updates
  const isUpdatingNavigationRef = useRef(false);

  /**
   * Create a promise that rejects after specified timeout
   */
  const createTimeoutPromise = (
    ms: number,
    message: string
  ): Promise<never> => {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  };

  /**
   * Fetch profile data from database with timeout and retry logic
   * Only called when needed (session changes, explicit refresh)
   */
  const fetchProfile = async (
    userId: string,
    retryCount: number = 0,
    useCache: boolean = true
  ): Promise<Profile | null> => {
    // Check cache first if enabled and valid
    if (
      useCache &&
      profileCache.current &&
      profileCacheUserId.current === userId
    ) {
      logger.info(
        `[AUTH] Using cached profile for user: ${userId.substring(0, 8)}...`
      );
      return profileCache.current;
    }

    try {
      // Race the profile fetch against a timeout
      const profilePromise = supabase
        .from("profiles")
        .select("onboarding_completed, onboarding_step")
        .eq("id", userId)
        .maybeSingle();

      const timeoutPromise = createTimeoutPromise(
        PROFILE_FETCH_TIMEOUT_MS,
        `Profile fetch timeout after ${PROFILE_FETCH_TIMEOUT_MS}ms`
      );

      const result = await Promise.race([profilePromise, timeoutPromise]);
      const { data: profile, error } = result;

      if (error) {
        logger.error(
          `[AUTH] Error fetching profile (attempt ${retryCount + 1}):`,
          error
        );

        // Retry on network errors (not on 404s or auth errors)
        if (
          retryCount < 2 &&
          error.code !== "PGRST116" &&
          error.code !== "42501"
        ) {
          logger.info(
            `[AUTH] Retrying profile fetch in ${
              TOKEN_REFRESH_RETRY_DELAY_MS * (retryCount + 1)
            }ms...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, TOKEN_REFRESH_RETRY_DELAY_MS * (retryCount + 1))
          );
          return fetchProfile(userId, retryCount + 1, useCache);
        }

        return null;
      }

      // Legacy users without profile row = treat as completed
      if (!profile) {
        const legacyProfile = {
          onboarding_completed: true,
          onboarding_step: 0,
        };
        // Cache the result
        profileCache.current = legacyProfile;
        profileCacheUserId.current = userId;
        return legacyProfile;
      }

      const parsedProfile = {
        onboarding_completed: !!profile.onboarding_completed,
        onboarding_step: Number(profile.onboarding_step || 0),
      };

      // Cache the result
      profileCache.current = parsedProfile;
      profileCacheUserId.current = userId;

      return parsedProfile;
    } catch (error: any) {
      // Handle timeout errors
      if (error?.message?.includes("timeout")) {
        logger.error(
          `[AUTH] Profile fetch timeout for user ${userId.substring(
            0,
            8
          )}... (attempt ${retryCount + 1})`
        );

        // Retry on timeout
        if (retryCount < 1) {
          logger.info(`[AUTH] Retrying profile fetch after timeout...`);
          await new Promise((resolve) =>
            setTimeout(resolve, TOKEN_REFRESH_RETRY_DELAY_MS * (retryCount + 1))
          );
          return fetchProfile(userId, retryCount + 1, useCache);
        }

        // On final timeout, return cached profile if available, otherwise treat as legacy user
        if (profileCache.current && profileCacheUserId.current === userId) {
          logger.warn(`[AUTH] Using stale cached profile due to timeout`);
          return profileCache.current;
        }

        logger.warn(`[AUTH] Treating as legacy user due to timeout`);
        return { onboarding_completed: true, onboarding_step: 0 };
      }

      logger.error("[AUTH] Error in fetchProfile:", error);
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
   * Includes deduplication to prevent concurrent updates
   */
  const updateNavigationState = async (currentSession: Session | null) => {
    // Prevent concurrent updates
    if (isUpdatingNavigationRef.current) {
      logger.info(
        "[AUTH] Navigation update already in progress, skipping duplicate call"
      );
      return;
    }

    isUpdatingNavigationRef.current = true;

    try {
      if (!currentSession?.user) {
        // No session = clear everything
        profileCache.current = null;
        profileCacheUserId.current = null;
        setNavigationState(NavigationState.PRE_SIGNUP);
        setOnboardingStep(0);
        setOnboardingCompleted(false);
        return;
      }

      // Fetch profile - fetchProfile handles caching internally
      const userId = currentSession.user.id;
      const useCache = !!(
        profileCache.current && profileCacheUserId.current === userId
      );
      const profile = await fetchProfile(userId, 0, useCache);

      // fetchProfile always updates cache internally, so use cached version for consistency
      const finalProfile = profileCache.current;
      const newState = determineNavigationState(true, finalProfile);

      setNavigationState(newState);
      setOnboardingStep(finalProfile?.onboarding_step || 0);
      setOnboardingCompleted(finalProfile?.onboarding_completed || false);
    } catch (error) {
      logger.error("[AUTH] Error in updateNavigationState:", error);
      // On error, try to use cached profile if available
      if (currentSession?.user) {
        const userId = currentSession.user.id;
        if (profileCache.current && profileCacheUserId.current === userId) {
          logger.warn("[AUTH] Using cached profile after error");
          const cachedProfile = profileCache.current;
          const newState = determineNavigationState(true, cachedProfile);
          setNavigationState(newState);
          setOnboardingStep(cachedProfile?.onboarding_step || 0);
          setOnboardingCompleted(cachedProfile?.onboarding_completed || false);
        }
      }
    } finally {
      isUpdatingNavigationRef.current = false;
    }
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
        // CRITICAL: Clear chat data to prevent cross-user data leakage
        "chatMessages",
        "chatId",
        "currentChatUserId",
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
      // Force refetch profile - clear cache first
      profileCache.current = null;
      profileCacheUserId.current = null;

      // Add small delay to ensure DB consistency after updates
      await new Promise((resolve) => setTimeout(resolve, 200));

      await updateNavigationState(session);
    }
  };

  /**
   * Handle TOKEN_REFRESHED event with proper error handling and recovery
   */
  const handleTokenRefresh = async (newSession: Session | null) => {
    // Prevent concurrent token refresh processing
    if (isProcessingTokenRefreshRef.current) {
      logger.info(
        "[AUTH] Token refresh already in progress, skipping duplicate"
      );
      return;
    }

    if (!newSession?.user) {
      logger.warn("[AUTH] Token refresh called with no session, skipping");
      return;
    }

    isProcessingTokenRefreshRef.current = true;

    try {
      // Small delay to ensure Supabase has fully updated the session internally
      await new Promise((resolve) =>
        setTimeout(resolve, INITIALIZATION_BUFFER_MS)
      );

      // Retry logic for getUser() to handle race conditions
      let user = null;
      let error = null;
      let retryCount = 0;

      while (retryCount < TOKEN_REFRESH_MAX_RETRIES) {
        const result = await supabase.auth.getUser();
        user = result.data.user;
        error = result.error;

        if (user?.id || error) {
          break; // Success or permanent error
        }

        retryCount++;
        if (retryCount < TOKEN_REFRESH_MAX_RETRIES) {
          logger.info(
            `[AUTH] Token refresh getUser retry ${retryCount}/${TOKEN_REFRESH_MAX_RETRIES}`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, TOKEN_REFRESH_RETRY_DELAY_MS * retryCount)
          );
        }
      }

      if (error || !user?.id) {
        logger.error(
          "[AUTH] Invalid user on token refresh after retries, signing out"
        );

        // Direct sign out - don't try to validate again as it will fail
        await supabase.auth.signOut();
        await clearAllCache();
        setSession(null);
        setIsAuthLoading(false);
        return;
      }

      // Emit event to notify components about token refresh with validated session
      DeviceEventEmitter.emit("authStateChanged", {
        event: "TOKEN_REFRESHED",
        session: newSession,
        validated: true,
      });

      // Update navigation state AFTER session is updated and validated
      await updateNavigationState(newSession);
    } catch (error) {
      logger.error("[AUTH] Error handling TOKEN_REFRESHED:", error);

      // On error, still try to update navigation state with current session
      // This ensures the app doesn't get stuck even if validation fails
      try {
        await updateNavigationState(newSession);
      } catch (navError) {
        logger.error(
          "[AUTH] Error updating navigation state after token refresh error:",
          navError
        );
      }
    } finally {
      isProcessingTokenRefreshRef.current = false;
    }
  };

  /**
   * Process pending token refresh if initialization is complete
   */
  const processPendingTokenRefresh = async () => {
    if (!isInitializedRef.current || !pendingTokenRefreshRef.current) {
      return;
    }

    const pending = pendingTokenRefreshRef.current;
    const age = Date.now() - pending.timestamp;

    // Ignore stale queued refreshes (older than 30 seconds)
    if (age > PENDING_REFRESH_STALE_MS) {
      logger.warn(
        `[AUTH] Ignoring stale pending token refresh (age: ${age}ms, max: ${PENDING_REFRESH_STALE_MS}ms)`
      );
      pendingTokenRefreshRef.current = null;
      return;
    }

    pendingTokenRefreshRef.current = null;

    logger.info(
      `[AUTH] Processing pending token refresh from initialization (age: ${age}ms)`
    );
    await handleTokenRefresh(pending.session);
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

        // Process any pending token refresh that occurred during initialization
        // Small delay to ensure all state updates are complete
        setTimeout(() => {
          processPendingTokenRefresh();
        }, INITIALIZATION_BUFFER_MS);
      } catch (error) {
        logger.error("Error initializing auth:", error);
        setIsAuthLoading(false);
        isInitializedRef.current = true; // Still mark as initialized to prevent stuck state

        // Clear any pending token refresh since initialization failed
        // This prevents processing stale refreshes after a failed init
        if (pendingTokenRefreshRef.current) {
          logger.warn(
            "[AUTH] Clearing pending token refresh due to initialization error"
          );
          pendingTokenRefreshRef.current = null;
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Listen for auth state changes
   *
   * CRITICAL: Session state is updated FIRST, then navigation state is updated.
   * This ensures components reading session get the latest token immediately.
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

      // CRITICAL FIX: Update session FIRST before any other operations
      // This ensures React state is updated immediately, preventing stale token reads
      setSession(newSession);

      // Handle token refresh with proper initialization handling
      if (event === "TOKEN_REFRESHED" && newSession) {
        // Check if initialization is complete
        if (!isInitializedRef.current) {
          // Queue the token refresh to process after initialization
          logger.info(
            "[AUTH] Queuing TOKEN_REFRESHED event - initialization not complete"
          );
          pendingTokenRefreshRef.current = {
            session: newSession,
            timestamp: Date.now(),
          };
          // Don't process yet - will be handled after initialization completes
          return;
        }

        // Process token refresh immediately if initialization is complete
        await handleTokenRefresh(newSession);
      } else {
        // For all other events, update navigation state after session update
        // Only if initialization is complete
        if (isInitializedRef.current) {
          await updateNavigationState(newSession);
        } else {
          // For other events during initialization, just log and wait
          logger.info(
            `[AUTH] Event ${event} received during initialization, will process after init`
          );
        }
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
