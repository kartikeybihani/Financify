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
import { useOnboardingFlow, OnboardingStage } from "./OnboardingFlowContext";
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
  const {
    currentStage,
    flowState,
    isLoading: onboardingLoading,
  } = useOnboardingFlow();
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

  // Determine navigation state based on session and onboarding flow
  const determineNavigationState = async (): Promise<{
    state: NavigationState;
    onboardingStage?: string;
  }> => {
    // Stage 1: No user session = PRE_SIGNUP
    if (!session?.user) {
      return { state: NavigationState.PRE_SIGNUP };
    }

    // Use onboarding flow context state instead of fetching from server
    logger.info("🔍 NavigationContext: Onboarding flow check", {
      currentStage,
      currentStageType: typeof currentStage,
      flowState,
      userId: session.user.id,
    });

    // Stage 3: User logged in AND onboarding complete = AUTHENTICATED
    if (
      flowState === "completed" ||
      currentStage === OnboardingStage.COMPLETE
    ) {
      return { state: NavigationState.AUTHENTICATED };
    }

    // Stage 2.5: User logged in, onboarding_stage is "final" but not complete = ONBOARDING_FINAL
    if (currentStage === OnboardingStage.FINAL) {
      return {
        state: NavigationState.ONBOARDING_FINAL,
        onboardingStage: currentStage || undefined,
      };
    }

    // Stage 2: User logged in BUT onboarding not complete = ONBOARDING
    return {
      state: NavigationState.ONBOARDING,
      onboardingStage: currentStage || OnboardingStage.INTENT_Q1,
    };
  };

  // Get the correct route for current state
  const getRouteForState = (
    state: NavigationState,
    onboardingStage?: string
  ): string => {
    switch (state) {
      case NavigationState.PRE_SIGNUP:
        // Stage 1: Welcome, Login, Signup screens
        return "/(auth)/welcome";

      case NavigationState.ONBOARDING:
        // Stage 2: Onboarding flow - route based on onboarding_stage
        if (onboardingStage === OnboardingStage.INTENT_Q2) {
          return "/onboarding-intent2";
        } else if (onboardingStage === OnboardingStage.INTENT_Q3) {
          return "/onboarding-intent3";
        } else if (onboardingStage === OnboardingStage.PROFILE) {
          return "/onboarding-profile";
        } else if (onboardingStage === OnboardingStage.PLAID_CONNECT) {
          return "/onboarding-connect";
        } else {
          // Default to first intent screen for q1 or undefined stages
          return "/onboarding-intent1";
        }

      case NavigationState.ONBOARDING_FINAL:
        // Stage 2.5: Final onboarding stage
        return "/(onboarding-complete)";

      case NavigationState.AUTHENTICATED:
        // Stage 3: Inside the app (tabs, settings, etc.)
        return "/(tabs)/chat"; // Default to chat tab

      default:
        return "/(auth)/welcome";
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
      "/onboarding-intent1",
      "/onboarding-intent2",
      "/onboarding-intent3",
      "/onboarding-profile",
      "/onboarding-connect",
      "/(onboarding-complete)",
    ];

    // If target state is ONBOARDING and user is on any onboarding screen, don't navigate
    if (targetState === NavigationState.ONBOARDING) {
      return onboardingScreens.includes(currentPath);
    }

    // If target state is ONBOARDING_FINAL, don't interfere if already on the final screen
    if (targetState === NavigationState.ONBOARDING_FINAL) {
      return currentPath === "/(onboarding-complete)";
    }

    return false;
  };

  // Main navigation function with loading states
  const navigateToCorrectScreen = async () => {
    if (authLoading || isInitializing || onboardingLoading) {
      logger.info(
        "⏳ NavigationContext: Waiting for auth/onboarding/initialization to complete"
      );
      return;
    }

    setIsLoading(true);

    try {
      const result = await determineNavigationState();
      const targetState = result.state;
      const onboardingStage = result.onboardingStage;

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
            targetState,
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

  // Handle auth and onboarding state changes with debounce to avoid navigation spam
  useEffect(() => {
    if (!isInitializing && !authLoading && !onboardingLoading) {
      // Increased debounce time for user metadata updates to prevent race conditions
      const timeoutId = setTimeout(() => {
        navigateToCorrectScreen();
      }, 1000); // Increased debounce to prevent loops

      return () => clearTimeout(timeoutId);
    }
  }, [session, authLoading, isInitializing, onboardingLoading]);

  // Clear cache when user signs out
  useEffect(() => {
    if (!session && !authLoading) {
      clearNavigationCache();
      setNavigationState(NavigationState.PRE_SIGNUP);
      logger.info(
        "🚪 NavigationContext: User signed out, returning to PRE_SIGNUP stage"
      );

      // Force immediate navigation to welcome screen on logout
      // router.replace("/(auth)/welcome" as any);
    }
  }, [session, authLoading]);

  const contextValue: NavigationContextType = {
    navigationState,
    isLoading: isLoading || authLoading || isInitializing || onboardingLoading,
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
