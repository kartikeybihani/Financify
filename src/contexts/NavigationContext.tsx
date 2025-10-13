import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/logger";

// Navigation states - the 4 main stages
export enum NavigationState {
  PRE_SIGNUP = "pre_signup", // Stage 1: Welcome, Login, Signup (user logged out)
  ONBOARDING = "onboarding", // Stage 2: Onboarding flow (user logged in, onboarding incomplete)
  ONBOARDING_FINAL = "onboarding_final", // Stage 2.5: Final onboarding stage (onboarding-complete screen)
  AUTHENTICATED = "authenticated", // Stage 3: Tabs, Settings, Investments (user logged in, onboarding complete)
}

interface NavigationContextType {
  // Current state
  navigationState: NavigationState;
  isLoading: boolean;
  isInitializing: boolean;
  onboardingStep?: number | null;
  onboardingCompleted?: boolean | null;

  // Navigation actions
  navigateToCorrectScreen: () => void;
  forceNavigationState: (state: NavigationState) => void;

  // Cache management
  clearNavigationCache: () => Promise<void>;
}

const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined
);

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
}) => {
  const { session, isLoading: authLoading } = useAuth();
  const hadUserRef = useRef<boolean>(false);

  // State management
  const [navigationState, setNavigationState] = useState<NavigationState>(
    NavigationState.PRE_SIGNUP
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasCompletedInitialNav, setHasCompletedInitialNav] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<
    boolean | null
  >(null);

  // Cache keys
  const CACHE_KEYS = {
    NAVIGATION_STATE: "navigation_state",
    USER_AUTHENTICATED: "user_authenticated",
  };

  // Load cached navigation state for instant UI
  const loadCachedState = async () => {
    try {
      const [cachedNavState, cachedAuth] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEYS.NAVIGATION_STATE),
        AsyncStorage.getItem(CACHE_KEYS.USER_AUTHENTICATED),
      ]);

      if (cachedNavState && cachedAuth === "true") {
        setNavigationState(cachedNavState as NavigationState);
        setHasCompletedInitialNav(true); // We have cached state, can show UI
        logger.info("📍 NavigationContext: Loaded cached state", {
          state: cachedNavState,
        });
      }
    } catch (error) {
      logger.error("❌ NavigationContext: Error loading cached state:", error);
    }
  };

  // Save navigation state to cache
  const saveNavigationState = async (state: NavigationState) => {
    try {
      await Promise.all([
        AsyncStorage.setItem(CACHE_KEYS.NAVIGATION_STATE, state),
        AsyncStorage.setItem(
          CACHE_KEYS.USER_AUTHENTICATED,
          session ? "true" : "false"
        ),
      ]);

      logger.info("💾 NavigationContext: Saved state to cache", {
        state,
      });
    } catch (error) {
      logger.error("❌ NavigationContext: Error saving state:", error);
    }
  };

  // Clear all navigation cache
  const clearNavigationCache = async () => {
    try {
      await AsyncStorage.multiRemove([
        CACHE_KEYS.NAVIGATION_STATE,
        CACHE_KEYS.USER_AUTHENTICATED,
      ]);

      logger.info("🗑️ NavigationContext: Cleared navigation cache");
    } catch (error) {
      logger.error("❌ NavigationContext: Error clearing cache:", error);
    }
  };

  // Determine navigation state based on session and onboarding flow
  const determineNavigationState = async (): Promise<{
    state: NavigationState;
    step?: number | null;
    completed?: boolean | null;
  }> => {
    // Stage 1: No user session = PRE_SIGNUP
    if (!session?.user) {
      setOnboardingStep(null);
      setOnboardingCompleted(null);
      return { state: NavigationState.PRE_SIGNUP };
    }

    // Fetch profile row
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("onboarding_completed, onboarding_step")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        logger.error("❌ NavigationContext: profiles fetch error", error);
      }

      // Legacy user: no profile row => treat as completed
      if (!profile) {
        setOnboardingStep(null);
        setOnboardingCompleted(true);
        return {
          state: NavigationState.AUTHENTICATED,
          step: null,
          completed: true,
        };
      }

      const completed = !!profile.onboarding_completed;
      const step = Number(profile.onboarding_step || 0);
      setOnboardingStep(step);
      setOnboardingCompleted(completed);

      if (completed) {
        return { state: NavigationState.AUTHENTICATED, step, completed };
      }

      // step 4 == final screen
      if (step === 4) {
        return { state: NavigationState.ONBOARDING_FINAL, step, completed };
      }

      return { state: NavigationState.ONBOARDING, step, completed };
    } catch (e) {
      logger.error("❌ NavigationContext: error determining state", e);
      // On error, hold at pre-signup to avoid misrouting
      return { state: NavigationState.PRE_SIGNUP };
    }
  };

  // Main navigation function - now just updates state without navigating
  // Let index.tsx handle the actual navigation declaratively
  const navigateToCorrectScreen = useCallback(async () => {
    if (authLoading || isInitializing) {
      logger.info(
        "⏳ NavigationContext: Waiting for auth/initialization to complete"
      );
      return;
    }

    setIsLoading(true);

    try {
      const result = await determineNavigationState();
      const targetState = result.state;

      // Update context state
      setNavigationState(targetState);

      // Save to cache for next app launch
      await saveNavigationState(targetState);

      // Mark that we've completed initial navigation determination
      setHasCompletedInitialNav(true);

      logger.info("📍 NavigationContext: Updated state", { targetState });
    } catch (error) {
      logger.error("❌ NavigationContext: Error updating state:", error);
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, isInitializing, session]);

  // Force a specific navigation state (for testing or manual control)
  const forceNavigationState = async (state: NavigationState) => {
    logger.info("🎯 NavigationContext: Force state update", { state });

    setNavigationState(state);
    await saveNavigationState(state);

    // State change will trigger redirect in index.tsx
  };

  // Initialize navigation context
  useEffect(() => {
    const initializeNavigation = async () => {
      setIsInitializing(true);

      // Load cached state first for instant UI
      await loadCachedState();

      // Small delay to let auth context settle
      setTimeout(() => {
        setIsInitializing(false);
      }, 100);
    };

    initializeNavigation();
  }, []);

  // Handle auth state changes with debounce to avoid navigation spam
  useEffect(() => {
    if (!isInitializing && !authLoading) {
      // Small debounce to batch state updates
      const timeoutId = setTimeout(() => {
        navigateToCorrectScreen();
      }, 100); // Reduced debounce for faster response

      return () => clearTimeout(timeoutId);
    }
  }, [navigateToCorrectScreen, authLoading, isInitializing]);

  // Clear cache when user signs out
  useEffect(() => {
    // Only clear when transitioning from real signed-in to signed-out
    if (!session && !authLoading && hadUserRef.current) {
      clearNavigationCache();
      setNavigationState(NavigationState.PRE_SIGNUP);
      setHasCompletedInitialNav(false); // Reset on logout
      logger.info(
        "🚪 NavigationContext: User signed out, returning to PRE_SIGNUP stage"
      );
      hadUserRef.current = false;
      return;
    }

    if (session?.user) {
      hadUserRef.current = true;
    }
  }, [session, authLoading]);

  const contextValue: NavigationContextType = {
    navigationState,
    isLoading:
      isLoading || authLoading || isInitializing || !hasCompletedInitialNav,
    isInitializing,
    onboardingStep,
    onboardingCompleted,
    navigateToCorrectScreen,
    forceNavigationState,
    clearNavigationCache,
  };

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigationContext = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error(
      "useNavigationContext must be used within a NavigationProvider"
    );
  }
  return context;
};

export default NavigationProvider;
