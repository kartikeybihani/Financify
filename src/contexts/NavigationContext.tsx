import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter, useSegments } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase/supabase";
import { useAuth } from "./AuthContext";
import logger from "@/src/utils/logger";

// Navigation states - only the 3 main stages
export enum NavigationState {
  PRE_SIGNUP = "pre_signup", // Stage 1: Welcome, Login, Signup (user logged out)
  ONBOARDING = "onboarding", // Stage 2: Onboarding flow (user logged in, onboarding incomplete)
  AUTHENTICATED = "authenticated", // Stage 3: Tabs, Settings, Investments (user logged in, onboarding complete)
}

interface NavigationContextType {
  // Current state
  navigationState: NavigationState;
  isLoading: boolean;
  isInitializing: boolean;

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
  const router = useRouter();
  const segments = useSegments();

  // State management
  const [navigationState, setNavigationState] = useState<NavigationState>(
    NavigationState.PRE_SIGNUP
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastNavigatedTo, setLastNavigatedTo] = useState<string | null>(null);

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

  // Determine navigation state based on session and metadata
  const determineNavigationState = async (
    user: any
  ): Promise<{ state: NavigationState; onboardingStage?: string }> => {
    // Stage 1: No user session = PRE_SIGNUP
    if (!user) {
      return { state: NavigationState.PRE_SIGNUP };
    }

    // Always fetch fresh user data to ensure we have the latest metadata
    const {
      data: { user: freshUser },
      error,
    } = await supabase.auth.getUser();

    if (error || !freshUser) {
      logger.error(
        "❌ NavigationContext: Error fetching fresh user data:",
        error
      );
      return { state: NavigationState.PRE_SIGNUP };
    }

    const meta = freshUser.user_metadata || {};
    const onboardingComplete = meta.onboarding_complete === true;
    const onboardingStage = meta.onboarding_stage;

    logger.info("🔍 NavigationContext: User metadata check", {
      onboardingComplete,
      onboardingStage,
      userId: freshUser.id,
      stage: onboardingComplete ? "AUTHENTICATED" : "ONBOARDING",
    });

    // Stage 3: User logged in AND onboarding complete = AUTHENTICATED
    if (onboardingComplete) {
      return { state: NavigationState.AUTHENTICATED };
    }

    // Stage 2: User logged in BUT onboarding not complete = ONBOARDING
    return { state: NavigationState.ONBOARDING, onboardingStage };
  };

  // Get the correct route for current state
  const getRouteForState = (
    state: NavigationState,
    onboardingStage?: string
  ): string => {
    switch (state) {
      case NavigationState.PRE_SIGNUP:
        // Stage 1: Welcome, Login, Signup screens
        return "/(onboarding)/welcome";

      case NavigationState.ONBOARDING:
        // Stage 2: Onboarding flow - route based on onboarding_stage
        // Now using separate route groups to prevent cross-mounting
        if (onboardingStage === "q2") {
          return "/(onboarding-profile)";
        } else if (onboardingStage === "plaid") {
          return "/(onboarding-connect)";
        } else if (onboardingStage === "final") {
          return "/(onboarding-complete)";
        } else {
          // Default to first intent screen for q1 or undefined
          return "/(onboarding-intent1)";
        }

      case NavigationState.AUTHENTICATED:
        // Stage 3: Inside the app (tabs, settings, etc.)
        return "/(tabs)/chat"; // Default to chat tab

      default:
        return "/(onboarding)/welcome";
    }
  };

  // Check if user is currently on the correct screen
  const isOnCorrectScreen = (targetRoute: string): boolean => {
    const currentPath = `/${segments.join("/")}`;
    const isCorrect = currentPath === targetRoute;

    logger.info("🔍 NavigationContext: Screen check", {
      currentPath,
      targetRoute,
      isCorrect,
    });

    return isCorrect;
  };

  // Check if user is on any valid onboarding screen (not just the target one)
  const isOnValidOnboardingScreen = (targetState: NavigationState): boolean => {
    const currentPath = `/${segments.join("/")}`;
    const onboardingScreens = [
      "/(onboarding-intent1)",
      "/(onboarding-intent2)",
      "/(onboarding-intent3)",
      "/(onboarding-profile)",
      "/(onboarding-connect)",
      "/(onboarding-complete)",
      // Old paths for backwards compatibility during transition
      "/(onboarding)/intent",
      "/(onboarding)/aboutyou",
      "/(onboarding)/accountconnection",
      "/(onboarding)/final",
    ];

    // If target state is ONBOARDING and user is on any onboarding screen, don't navigate
    if (targetState === NavigationState.ONBOARDING) {
      return onboardingScreens.includes(currentPath);
    }

    return false;
  };

  // Main navigation function with loading states
  const navigateToCorrectScreen = async () => {
    if (authLoading || isInitializing) {
      logger.info(
        "⏳ NavigationContext: Waiting for auth/initialization to complete"
      );
      return;
    }

    setIsLoading(true);

    try {
      let targetState: NavigationState;
      let onboardingStage: string | undefined;

      if (session?.user) {
        const result = await determineNavigationState(session.user);
        targetState = result.state;
        onboardingStage = result.onboardingStage;
      } else {
        targetState = NavigationState.PRE_SIGNUP;
      }

      const targetRoute = getRouteForState(targetState, onboardingStage);

      // Update context state
      setNavigationState(targetState);

      // Save to cache for next app launch
      await saveNavigationState(targetState);

      // Check if user is already on a valid onboarding screen
      // If so, don't interfere with manual navigation within onboarding flow
      if (isOnValidOnboardingScreen(targetState)) {
        logger.info(
          "✅ NavigationContext: User already in onboarding flow, not interfering",
          {
            currentPath: `/${segments.join("/")}`,
            targetRoute,
            onboardingStage,
          }
        );
        setIsLoading(false);
        return;
      }

      // Only navigate if not already on correct screen
      if (!isOnCorrectScreen(targetRoute)) {
        logger.info("🧭 NavigationContext: Navigating", {
          from: `/${segments.join("/")}`,
          to: targetRoute,
          state: targetState,
          onboardingStage,
        });

        // Prevent duplicate navigation
        if (lastNavigatedTo === targetRoute) {
          logger.info(
            "⏭️ NavigationContext: Already navigated to this route, skipping"
          );
          setIsLoading(false);
          return;
        }

        setLastNavigatedTo(targetRoute);

        // For logout scenarios, use push to avoid navigation stack issues
        if (targetState === NavigationState.PRE_SIGNUP) {
          try {
            router.push(targetRoute as any);
          } catch (error) {
            logger.error(
              "❌ NavigationContext: Push failed, trying replace:",
              error
            );
            router.replace(targetRoute as any);
          }
        } else {
          router.replace(targetRoute as any);
        }

        // Reset navigation tracking after delay
        setTimeout(() => {
          setLastNavigatedTo(null);
        }, 1000);
      } else {
        logger.info(
          "✅ NavigationContext: Already on correct screen",
          targetRoute
        );
      }
    } catch (error) {
      logger.error("❌ NavigationContext: Error during navigation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Force a specific navigation state (for testing or manual control)
  const forceNavigationState = async (state: NavigationState) => {
    logger.info("🎯 NavigationContext: Force navigation", { state });

    setNavigationState(state);
    await saveNavigationState(state);

    const targetRoute = getRouteForState(state);
    setLastNavigatedTo(targetRoute);
    router.replace(targetRoute as any);

    setTimeout(() => {
      setLastNavigatedTo(null);
    }, 1000);
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
      // Debounce navigation to avoid rapid re-navigation during user metadata updates
      const timeoutId = setTimeout(() => {
        navigateToCorrectScreen();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [session, authLoading, isInitializing]);

  // Clear cache when user signs out
  useEffect(() => {
    if (!session && !authLoading) {
      clearNavigationCache();
      setNavigationState(NavigationState.PRE_SIGNUP);
      logger.info(
        "🚪 NavigationContext: User signed out, returning to PRE_SIGNUP stage"
      );

      // NavigationContext will automatically navigate via the main navigation logic
      // No need for explicit navigation here since it's handled by the useEffect above
    }
  }, [session, authLoading]);

  const contextValue: NavigationContextType = {
    navigationState,
    isLoading: isLoading || authLoading || isInitializing,
    isInitializing,
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
