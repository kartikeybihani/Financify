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
import {
  invalidateTokenCache,
  startTokenRefresh,
} from "@/src/utils/auth/authToken";
import { isRecoveryInProgress } from "@/src/utils/auth/recoveryState";

// Constants
const PROFILE_FETCH_TIMEOUT_MS = 8000; // 8 seconds timeout for profile fetch
const TOKEN_REFRESH_RETRY_DELAY_MS = 200;
const TOKEN_REFRESH_MAX_RETRIES = 3;
const INITIALIZATION_BUFFER_MS = 100; // Buffer for initialization completion
const PENDING_REFRESH_STALE_MS = 30000; // 30 seconds - ignore stale queued refreshes
const NAV_STATE_CACHE_KEY = "cached_nav_state";
const NAV_STATE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
   * Creates a promise that rejects after a specified timeout duration.
   * Used to prevent infinite hangs on database operations.
   *
   * @param ms - Timeout duration in milliseconds
   * @param message - Error message to include in rejection
   * @returns Promise that rejects after the timeout
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
   * Fetches user profile data from the database with timeout protection and retry logic.
   *
   * This function implements robust error handling for profile fetches:
   * - Checks in-memory cache first to avoid unnecessary database calls
   * - Uses an 8-second timeout to prevent infinite hangs
   * - Retries on network errors (but not on 404s or auth errors)
   * - Falls back to cached profile on timeout if available
   * - Treats missing profiles as legacy users (onboarding completed)
   *
   * The caching mechanism is critical for performance, especially during token refresh
   * when multiple navigation state updates might be triggered.
   *
   * @param userId - The user ID to fetch profile for
   * @param retryCount - Current retry attempt (used internally for recursion)
   * @param useCache - Whether to check cache before fetching (default: true)
   * @returns Promise resolving to Profile object or null on error
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

      // Type guard: timeoutPromise always rejects, so if we reach here, result is from profilePromise
      if (result instanceof Error) {
        throw result;
      }

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
   * Caches navigation state to AsyncStorage for fast app startup.
   * Stores state, userId, onboardingStep, and timestamp.
   */
  const cacheNavigationState = async (
    state: NavigationState,
    userId: string | null,
    step: number,
    completed: boolean
  ) => {
    try {
      if (!userId) {
        // Don't cache if no user (PRE_SIGNUP state)
        await AsyncStorage.removeItem(NAV_STATE_CACHE_KEY);
        return;
      }

      const cacheData = {
        state,
        userId,
        onboardingStep: step,
        onboardingCompleted: completed,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(
        NAV_STATE_CACHE_KEY,
        JSON.stringify(cacheData)
      );
      logger.info(`[AUTH] Cached navigation state: ${state} for user ${userId.substring(0, 8)}...`);
    } catch (error) {
      logger.error("[AUTH] Error caching navigation state:", error);
    }
  };

  /**
   * Loads cached navigation state from AsyncStorage.
   * Returns null if cache is missing, stale, or for different user.
   */
  const loadCachedNavigationState = async (
    currentUserId: string | null
  ): Promise<{
    state: NavigationState;
    onboardingStep: number;
    onboardingCompleted: boolean;
  } | null> => {
    try {
      const cached = await AsyncStorage.getItem(NAV_STATE_CACHE_KEY);
      if (!cached) {
        return null;
      }

      const cacheData = JSON.parse(cached);
      const age = Date.now() - (cacheData.timestamp || 0);

      // Validate cache
      if (
        age > NAV_STATE_CACHE_MAX_AGE_MS ||
        cacheData.userId !== currentUserId ||
        !cacheData.state
      ) {
        logger.info("[AUTH] Navigation cache invalid or stale, ignoring");
        return null;
      }

      logger.info(
        `[AUTH] Loaded cached navigation state: ${cacheData.state} (age: ${Math.round(age / 1000)}s)`
      );
      return {
        state: cacheData.state as NavigationState,
        onboardingStep: cacheData.onboardingStep || 0,
        onboardingCompleted: cacheData.onboardingCompleted || false,
      };
    } catch (error) {
      logger.error("[AUTH] Error loading cached navigation state:", error);
      return null;
    }
  };

  /**
   * Determines the appropriate navigation state based on session and profile data.
   *
   * This is a pure function that maps authentication and onboarding status to one of
   * four navigation states: PRE_SIGNUP, ONBOARDING, ONBOARDING_FINAL, or AUTHENTICATED.
   *
   * @param hasSession - Whether the user has an active session
   * @param profile - User profile data containing onboarding status
   * @returns The appropriate NavigationState enum value
   */
  const determineNavigationState = (
    hasSession: boolean,
    profile: Profile | null
  ): NavigationState => {
    if (!hasSession) {
      return NavigationState.PRE_SIGNUP;
    }

    if (!profile) {
      return NavigationState.AUTHENTICATED;
    }

    if (profile.onboarding_completed) {
      return NavigationState.AUTHENTICATED;
    }

    if (profile.onboarding_step === 4) {
      return NavigationState.ONBOARDING_FINAL;
    }

    return NavigationState.ONBOARDING;
  };

  /**
   * Updates the navigation state based on the current session.
   *
   * This function is critical for routing users to the correct screen based on their
   * authentication and onboarding status. It:
   * - Prevents concurrent updates using a lock mechanism
   * - Fetches user profile data (with caching)
   * - Determines the appropriate navigation state
   * - Updates React state to trigger navigation changes
   *
   * IMPORTANT: This function is designed to be non-blocking when called from token refresh.
   * It can take several seconds if the database fetch is slow, so it should be called
   * in the background during token refresh to prevent blocking other operations.
   *
   * @param currentSession - The current Supabase session (or null if signed out)
   */
  const updateNavigationState = async (currentSession: Session | null) => {
    // Prevent concurrent updates
    if (isUpdatingNavigationRef.current) {
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
        await cacheNavigationState(NavigationState.PRE_SIGNUP, null, 0, false);
        return;
      }

      if (isRecoveryInProgress()) {
        const userId = currentSession.user.id;
        const cachedProfile =
          profileCache.current && profileCacheUserId.current === userId
            ? profileCache.current
            : null;
        const newState = determineNavigationState(true, cachedProfile);
        logger.info("[AUTH] Skipping profile fetch during password recovery");
        setNavigationState(newState);
        setOnboardingStep(cachedProfile?.onboarding_step || 0);
        setOnboardingCompleted(cachedProfile?.onboarding_completed || false);
        return;
      }

      // Fetch profile - fetchProfile handles caching internally
      const userId = currentSession.user.id;
      const useCache = !!(
        profileCache.current && profileCacheUserId.current === userId
      );
      const profile = await fetchProfile(userId, 0, useCache);

      // Use the returned profile value (fetchProfile updates cache on success, but may return null on error)
      // If profile is null, fall back to cached profile if available for the same user
      const finalProfile =
        profile ||
        (profileCache.current && profileCacheUserId.current === userId
          ? profileCache.current
          : null);
      const newState = determineNavigationState(true, finalProfile);

      setNavigationState(newState);
      setOnboardingStep(finalProfile?.onboarding_step || 0);
      setOnboardingCompleted(finalProfile?.onboarding_completed || false);

      // Cache the navigation state for fast app startup
      await cacheNavigationState(
        newState,
        currentSession.user.id,
        finalProfile?.onboarding_step || 0,
        finalProfile?.onboarding_completed || false
      );
    } catch (error) {
      logger.error("[AUTH] Error in updateNavigationState:", error);
      // On error, try to use cached profile if available
      if (currentSession?.user) {
        const userId = currentSession.user.id;
        if (profileCache.current && profileCacheUserId.current === userId) {
          const cachedProfile = profileCache.current;
          const newState = determineNavigationState(true, cachedProfile);
          setNavigationState(newState);
          setOnboardingStep(cachedProfile?.onboarding_step || 0);
          setOnboardingCompleted(cachedProfile?.onboarding_completed || false);
          // Cache the fallback state
          await cacheNavigationState(
            newState,
            userId,
            cachedProfile?.onboarding_step || 0,
            cachedProfile?.onboarding_completed || false
          );
        }
      }
    } finally {
      isUpdatingNavigationRef.current = false;
    }
  };

  /**
   * Clears all app cache and stored data on sign out.
   *
   * This is critical for security to prevent data leakage between user sessions.
   * Clears both AsyncStorage items and in-memory profile cache.
   */
  const clearAllCache = async () => {
    try {
      // Import cache clearing functions dynamically to avoid circular dependencies
      const { clearInvestmentCache } = await import(
        "@/src/shared/utils/investmentCache"
      );
      const { clearRecurringCache } = await import(
        "@/src/shared/utils/recurringCache"
      );
      const { clearTransactionsCache } = await import(
        "@/src/shared/utils/transactionCache"
      );
      const { clearSpendingCache } = await import(
        "@/src/shared/utils/spendingCache"
      );

      // Clear all user-specific caches (passing undefined clears all user caches)
      await Promise.all([
        clearInvestmentCache(), // Clears all user investment caches
        clearRecurringCache(), // Clears all user recurring caches
        clearTransactionsCache(), // Clears all user transaction caches
        clearSpendingCache(), // Clears all user spending caches
      ]);

      // Clear profile cache (finny_style, checkin_frequency)
      const { clearProfileCache } = await import(
        "@/src/utils/profile/profileCache"
      );
      await clearProfileCache();

      // Clear other app-specific cache keys
      await AsyncStorage.multiRemove([
        "onboarding_complete",
        "user_authenticated",
        "userData",
        "onboarding_started",
        NAV_STATE_CACHE_KEY, // Clear navigation state cache
        // CRITICAL: Clear chat data to prevent cross-user data leakage
        "chatMessages",
        "chatId",
        "currentChatUserId",
        // Clear old global cache keys (for backward compatibility during migration)
        "cached_investment_data",
        "cached_investment_data_timestamp",
        "cached_recurring_transactions",
        "cached_recurring_transactions_timestamp",
        "cached_account_balances",
        "cached_account_balances_timestamp",
        "cached_transactions",
        "cached_transactions_timestamp",
        "cached_spending_breakdown",
        "cached_spending_breakdown_timestamp",
        "cached_goals",
        "cached_goals_timestamp",
      ]);

      profileCache.current = null;
      profileCacheUserId.current = null;

      logger.info("🗑️ [CACHE] All caches cleared on logout");
    } catch (error) {
      logger.error("❌ [CACHE] Error clearing cache:", error);
    }
  };

  /**
   * Public method to force a refresh of navigation state.
   *
   * This is useful when onboarding state changes and you need to immediately
   * update the navigation routing. It clears the profile cache and refetches
   * from the database to ensure the latest state is used.
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
   * Handles the TOKEN_REFRESHED event from Supabase with robust error handling.
   *
   * This is the core function that processes token refresh events. It implements
   * a critical design principle: NEVER auto-logout users during token refresh.
   *
   * Key behaviors:
   * - Prevents concurrent processing with a lock mechanism
   * - Validates the user with retry logic (for diagnostics only)
   * - NEVER signs the user out, even if validation fails
   * - Updates navigation state in the background (non-blocking)
   * - Releases the lock immediately so other operations can proceed
   *
   * The non-blocking navigation update is essential because updateNavigationState
   * can take several seconds if the database is slow, and we don't want token
   * refresh to block chat messages or other user interactions.
   *
   * If validation fails, we keep the existing session and let subsequent API calls
   * (which use getFreshAccessToken with timeout protection) surface real session
   * failures. This prevents false logouts during transient network issues.
   *
   * @param newSession - The new session object from Supabase after token refresh
   */
  const handleTokenRefresh = async (newSession: Session | null) => {
    // Prevent concurrent token refresh processing
    if (isProcessingTokenRefreshRef.current) {
      return;
    }

    if (!newSession?.user) {
      return;
    }

    isProcessingTokenRefreshRef.current = true;

    try {
      await new Promise((resolve) =>
        setTimeout(resolve, INITIALIZATION_BUFFER_MS)
      );

      let user = null as Session["user"] | null;
      let error: any = null;
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
          await new Promise((resolve) =>
            setTimeout(resolve, TOKEN_REFRESH_RETRY_DELAY_MS * retryCount)
          );
        }
      }

      // Use the token refresh coordinator to manage the refresh lifecycle
      const refreshFn = async (): Promise<string | null> => {
        await new Promise((resolve) => setTimeout(resolve, 100));

        const {
          data: { session: latestSession },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError || !latestSession?.access_token) {
          return null;
        }

        return latestSession.access_token;
      };

      const newToken = await startTokenRefresh(refreshFn);

      DeviceEventEmitter.emit("authStateChanged", {
        event: "TOKEN_REFRESHED",
        session: newSession,
        validated: !!user?.id && !error && !!newToken,
      });

      updateNavigationState(newSession).catch((navError) => {
        logger.error("[AUTH] Error updating navigation state:", navError);
      });
    } catch (error) {
      logger.error("[AUTH] Error handling TOKEN_REFRESHED:", error);
      updateNavigationState(newSession).catch((navError) => {
        logger.error("[AUTH] Error updating navigation state:", navError);
      });
    } finally {
      isProcessingTokenRefreshRef.current = false;
    }
  };

  /**
   * Processes any pending token refresh that occurred during app initialization.
   *
   * If a TOKEN_REFRESHED event fires before initialization completes, it gets queued.
   * This function processes that queue after initialization, ignoring stale refreshes
   * older than 30 seconds.
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
        // Initialize profile cache from AsyncStorage (non-blocking)
        const { initializeProfileCache } = await import(
          "@/src/utils/profile/profileCache"
        );
        initializeProfileCache().catch((error) => {
          logger.warn("[AUTH] Failed to initialize profile cache:", error);
        });

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

          // OPTIMISTIC NAVIGATION: Load cached state immediately for instant navigation
          const cachedState = await loadCachedNavigationState(user.id);
          if (cachedState) {
            logger.info("[AUTH] Using cached navigation state for instant navigation");
            setNavigationState(cachedState.state);
            setOnboardingStep(cachedState.onboardingStep);
            setOnboardingCompleted(cachedState.onboardingCompleted);
            // Set loading to false immediately so navigation can proceed
            setIsAuthLoading(false);
            isInitializedRef.current = true;
            
            // Fetch fresh data in background (non-blocking)
            // This ensures we have the latest state, but doesn't block navigation
            updateNavigationState(initialSession).catch((error) => {
              logger.error("[AUTH] Background navigation state update failed:", error);
            });
          } else {
            // No cache available, fetch fresh data (this will take longer)
            await updateNavigationState(initialSession);
            setIsAuthLoading(false);
            isInitializedRef.current = true;
          }
        } else {
          setSession(null);
          setNavigationState(NavigationState.PRE_SIGNUP);
          await cacheNavigationState(NavigationState.PRE_SIGNUP, null, 0, false);
          setIsAuthLoading(false);
          isInitializedRef.current = true;
        }

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

      setSession(newSession);

      // Handle token refresh with proper initialization handling
      if (event === "TOKEN_REFRESHED" && newSession) {
        if (!isInitializedRef.current) {
          pendingTokenRefreshRef.current = {
            session: newSession,
            timestamp: Date.now(),
          };
          return;
        }
        await handleTokenRefresh(newSession);
      } else {
        if (isInitializedRef.current) {
          await updateNavigationState(newSession);
        }
      }

      if (event === "SIGNED_OUT") {
        invalidateTokenCache();
        await clearAllCache();
        logger.info("🚪 Signed out and cleared cache");
      }

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
