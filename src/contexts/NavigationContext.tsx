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

// Navigation states based on your three-stage requirement
export enum NavigationState {
  PRE_SIGNUP = "pre_signup", // Stage 1: Welcome, Login, Signup (user logged out)
  ONBOARDING = "onboarding", // Stage 2: Intent, AboutYou, AccountConnection, Final (user logged in, onboarding incomplete)
  AUTHENTICATED = "authenticated", // Stage 3: Tabs, Settings, Investments (user logged in, onboarding complete)
}

export enum OnboardingStage {
  WELCOME = "welcome",
  INTENT = "q1", // Intent questions
  ABOUT_YOU = "q2", // About you form
  ACCOUNT_CONNECTION = "plaid", // Plaid connection
  FINAL = "final", // Completion screen
}

interface NavigationContextType {
  // Current state
  navigationState: NavigationState;
  onboardingStage: OnboardingStage | null;
  isLoading: boolean;
  isInitializing: boolean;

  // Navigation actions
  navigateToCorrectScreen: () => void;
  forceNavigationState: (
    state: NavigationState,
    stage?: OnboardingStage
  ) => void;

  // Onboarding helpers
  updateOnboardingStage: (stage: OnboardingStage) => Promise<void>;
  completeOnboarding: () => Promise<void>;

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
  const [onboardingStage, setOnboardingStage] =
    useState<OnboardingStage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastNavigatedTo, setLastNavigatedTo] = useState<string | null>(null);

  // Cache keys
  const CACHE_KEYS = {
    NAVIGATION_STATE: "navigation_state",
    ONBOARDING_STAGE: "onboarding_stage",
    ONBOARDING_COMPLETE: "onboarding_complete",
    USER_AUTHENTICATED: "user_authenticated",
  };

  // Load cached navigation state for instant UI
  const loadCachedState = async () => {
    try {
      const [cachedNavState, cachedStage, cachedComplete, cachedAuth] =
        await Promise.all([
          AsyncStorage.getItem(CACHE_KEYS.NAVIGATION_STATE),
          AsyncStorage.getItem(CACHE_KEYS.ONBOARDING_STAGE),
          AsyncStorage.getItem(CACHE_KEYS.ONBOARDING_COMPLETE),
          AsyncStorage.getItem(CACHE_KEYS.USER_AUTHENTICATED),
        ]);

      if (cachedNavState && cachedAuth === "true") {
        setNavigationState(cachedNavState as NavigationState);
        if (cachedStage) {
          setOnboardingStage(cachedStage as OnboardingStage);
        }
        logger.info("📍 NavigationContext: Loaded cached state", {
          state: cachedNavState,
          stage: cachedStage,
          complete: cachedComplete,
        });
      }
    } catch (error) {
      logger.error("❌ NavigationContext: Error loading cached state:", error);
    }
  };

  // Save navigation state to cache
  const saveNavigationState = async (
    state: NavigationState,
    stage?: OnboardingStage
  ) => {
    try {
      await Promise.all([
        AsyncStorage.setItem(CACHE_KEYS.NAVIGATION_STATE, state),
        stage
          ? AsyncStorage.setItem(CACHE_KEYS.ONBOARDING_STAGE, stage)
          : Promise.resolve(),
        AsyncStorage.setItem(
          CACHE_KEYS.USER_AUTHENTICATED,
          session ? "true" : "false"
        ),
      ]);

      logger.info("💾 NavigationContext: Saved state to cache", {
        state,
        stage,
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
        CACHE_KEYS.ONBOARDING_STAGE,
        CACHE_KEYS.ONBOARDING_COMPLETE,
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
  ): Promise<{ state: NavigationState; stage: OnboardingStage | null }> => {
    // Stage 1: No user session = PRE_SIGNUP
    if (!user) {
      return { state: NavigationState.PRE_SIGNUP, stage: null };
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
      return { state: NavigationState.PRE_SIGNUP, stage: null };
    }

    const meta = freshUser.user_metadata || {};
    const onboardingComplete = meta.onboarding_complete === true;

    logger.info("🔍 NavigationContext: User metadata check", {
      onboardingComplete,
      onboardingStage: meta.onboarding_stage,
      userId: freshUser.id,
      stage: onboardingComplete ? "AUTHENTICATED" : "ONBOARDING",
    });

    // Stage 3: User logged in AND onboarding complete = AUTHENTICATED
    if (onboardingComplete) {
      return { state: NavigationState.AUTHENTICATED, stage: null };
    }

    // Stage 2: User logged in BUT onboarding not complete = ONBOARDING
    const stage = meta.onboarding_stage || OnboardingStage.INTENT;
    return {
      state: NavigationState.ONBOARDING,
      stage: stage as OnboardingStage,
    };
  };

  // Get the correct route for current state
  const getRouteForState = (
    state: NavigationState,
    stage?: OnboardingStage | null
  ): string => {
    switch (state) {
      case NavigationState.PRE_SIGNUP:
        // Stage 1: Welcome, Login, Signup screens
        return "/(onboarding)/welcome";

      case NavigationState.ONBOARDING:
        // Stage 2: Onboarding flow screens
        switch (stage) {
          case OnboardingStage.WELCOME:
            return "/(onboarding)/welcome";
          case OnboardingStage.INTENT:
            return "/(onboarding)/intent";
          case OnboardingStage.ABOUT_YOU:
            return "/(onboarding)/aboutyou";
          case OnboardingStage.ACCOUNT_CONNECTION:
            return "/(onboarding)/accountconnection";
          case OnboardingStage.FINAL:
            return "/(onboarding)/final";
          default:
            return "/(onboarding)/intent"; // Default fallback
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
      let targetStage: OnboardingStage | null = null;

      if (session?.user) {
        const { state, stage } = await determineNavigationState(session.user);
        targetState = state;
        targetStage = stage;
      } else {
        targetState = NavigationState.PRE_SIGNUP;
      }

      const targetRoute = getRouteForState(targetState, targetStage);

      // Update context state
      setNavigationState(targetState);
      setOnboardingStage(targetStage);

      // Save to cache for next app launch
      await saveNavigationState(targetState, targetStage || undefined);

      // Only navigate if not already on correct screen
      if (!isOnCorrectScreen(targetRoute)) {
        logger.info("🧭 NavigationContext: Navigating", {
          from: `/${segments.join("/")}`,
          to: targetRoute,
          state: targetState,
          stage: targetStage,
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
  const forceNavigationState = async (
    state: NavigationState,
    stage?: OnboardingStage
  ) => {
    logger.info("🎯 NavigationContext: Force navigation", { state, stage });

    setNavigationState(state);
    setOnboardingStage(stage || null);
    await saveNavigationState(state, stage);

    const targetRoute = getRouteForState(state, stage);
    setLastNavigatedTo(targetRoute);
    router.replace(targetRoute as any);

    setTimeout(() => {
      setLastNavigatedTo(null);
    }, 1000);
  };

  // Update onboarding stage in Supabase and context
  const updateOnboardingStage = async (stage: OnboardingStage) => {
    if (!session?.user) {
      logger.error("❌ NavigationContext: No user session for stage update");
      return;
    }

    try {
      await supabase.auth.updateUser({
        data: { onboarding_stage: stage },
      });

      setOnboardingStage(stage);
      await saveNavigationState(NavigationState.ONBOARDING, stage);

      logger.info("✅ NavigationContext: Updated onboarding stage", stage);
    } catch (error) {
      logger.error("❌ NavigationContext: Error updating stage:", error);
    }
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    if (!session?.user) {
      logger.error(
        "❌ NavigationContext: No user session for onboarding completion"
      );
      return;
    }

    try {
      await Promise.all([
        supabase.auth.updateUser({
          data: { onboarding_complete: true },
        }),
        AsyncStorage.setItem(CACHE_KEYS.ONBOARDING_COMPLETE, "true"),
      ]);

      setNavigationState(NavigationState.AUTHENTICATED);
      setOnboardingStage(null);
      await saveNavigationState(NavigationState.AUTHENTICATED);

      logger.info("🎉 NavigationContext: Onboarding completed");

      // Force navigation to authenticated state
      setTimeout(() => {
        navigateToCorrectScreen();
      }, 500);
    } catch (error) {
      logger.error("❌ NavigationContext: Error completing onboarding:", error);
    }
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

  // Handle auth state changes
  useEffect(() => {
    if (!isInitializing && !authLoading) {
      navigateToCorrectScreen();
    }
  }, [session, authLoading, isInitializing]);

  // Clear cache when user signs out
  useEffect(() => {
    if (!session && !authLoading) {
      clearNavigationCache();
      setNavigationState(NavigationState.PRE_SIGNUP);
      setOnboardingStage(null);
      logger.info(
        "🚪 NavigationContext: User signed out, returning to PRE_SIGNUP stage"
      );

      // NavigationContext will automatically navigate via the main navigation logic
      // No need for explicit navigation here since it's handled by the useEffect above
    }
  }, [session, authLoading]);

  const contextValue: NavigationContextType = {
    navigationState,
    onboardingStage,
    isLoading: isLoading || authLoading || isInitializing,
    isInitializing,
    navigateToCorrectScreen,
    forceNavigationState,
    updateOnboardingStage,
    completeOnboarding,
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
