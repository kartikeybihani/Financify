import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase/supabase";
import { useAuth } from "./AuthContext";
import logger from "@/src/utils/logger";

// Onboarding stages in order
export enum OnboardingStage {
  INTENT_Q1 = "q1",
  INTENT_Q2 = "q2",
  INTENT_Q3 = "q3",
  PROFILE = "profile",
  PLAID_CONNECT = "plaid",
  FINAL = "final",
  COMPLETE = "complete",
}

// Onboarding flow state
export enum OnboardingFlowState {
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}

interface OnboardingFlowContextType {
  // Current state
  currentStage: OnboardingStage | null;
  flowState: OnboardingFlowState;
  isLoading: boolean;

  // Actions
  updateStage: (
    stage: OnboardingStage,
    saveToServer?: boolean
  ) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;

  // Getters
  getNextStage: (currentStage: OnboardingStage) => OnboardingStage | null;
  getPreviousStage: (currentStage: OnboardingStage) => OnboardingStage | null;
  isStageValid: (stage: string) => boolean;

  // Cache management
  clearOnboardingCache: () => Promise<void>;
}

const OnboardingFlowContext = createContext<
  OnboardingFlowContextType | undefined
>(undefined);

interface OnboardingFlowProviderProps {
  children: ReactNode;
}

export const OnboardingFlowProvider: React.FC<OnboardingFlowProviderProps> = ({
  children,
}) => {
  const { session } = useAuth();
  const hadUserRef = useRef<boolean>(false);

  // State management
  const [currentStage, setCurrentStage] = useState<OnboardingStage | null>(
    null
  );
  const [flowState, setFlowState] = useState<OnboardingFlowState>(
    OnboardingFlowState.IN_PROGRESS
  );
  const [isLoading, setIsLoading] = useState(true);

  // Cache keys
  const CACHE_KEYS = {
    CURRENT_STAGE: "onboarding_current_stage",
    FLOW_STATE: "onboarding_flow_state",
  };

  // Stage order for navigation logic
  const STAGE_ORDER: OnboardingStage[] = [
    OnboardingStage.INTENT_Q1,
    OnboardingStage.INTENT_Q2,
    OnboardingStage.INTENT_Q3,
    OnboardingStage.PROFILE,
    OnboardingStage.PLAID_CONNECT,
    OnboardingStage.FINAL,
    OnboardingStage.COMPLETE,
  ];

  // Load cached onboarding state
  const loadCachedState = async () => {
    try {
      const [cachedStage, cachedFlowState] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEYS.CURRENT_STAGE),
        AsyncStorage.getItem(CACHE_KEYS.FLOW_STATE),
      ]);

      if (cachedStage && cachedFlowState) {
        // Map cached stage to enum if it's in server format
        const mappedStage =
          mapServerStageToEnum(cachedStage) || (cachedStage as OnboardingStage);
        setCurrentStage(mappedStage);
        setFlowState(cachedFlowState as OnboardingFlowState);
        logger.info("📍 OnboardingFlow: Loaded cached state", {
          cachedStage,
          mappedStage,
          flowState: cachedFlowState,
        });
      }
    } catch (error) {
      logger.error("❌ OnboardingFlow: Error loading cached state:", error);
    }
  };

  // Save onboarding state to cache
  const saveOnboardingState = async (
    stage: OnboardingStage | null,
    flowState: OnboardingFlowState
  ) => {
    try {
      // Convert enum to server format for consistent storage
      const serverStage = stage ? mapEnumToServerStage(stage) : "";

      await Promise.all([
        AsyncStorage.setItem(CACHE_KEYS.CURRENT_STAGE, serverStage),
        AsyncStorage.setItem(CACHE_KEYS.FLOW_STATE, flowState),
      ]);

      logger.info("💾 OnboardingFlow: Saved state to cache", {
        enumStage: stage,
        serverStage,
        flowState,
      });
    } catch (error) {
      logger.error("❌ OnboardingFlow: Error saving state:", error);
    }
  };

  // Clear onboarding cache
  const clearOnboardingCache = async () => {
    try {
      await AsyncStorage.multiRemove([
        CACHE_KEYS.CURRENT_STAGE,
        CACHE_KEYS.FLOW_STATE,
        "pending_intent_answers", // Clear pending answers too
      ]);

      logger.info("🗑️ OnboardingFlow: Cleared onboarding cache");
    } catch (error) {
      logger.error("❌ OnboardingFlow: Error clearing cache:", error);
    }
  };

  // Initialize onboarding state from user metadata
  const initializeFromUserMetadata = async () => {
    if (!session?.user) {
      setCurrentStage(null);
      setFlowState(OnboardingFlowState.IN_PROGRESS);
      setIsLoading(false);
      return;
    }

    try {
      // Get fresh user data
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        logger.error("❌ OnboardingFlow: Error fetching user:", error);
        setCurrentStage(OnboardingStage.INTENT_Q1); // Default to first stage instead of null
        setFlowState(OnboardingFlowState.IN_PROGRESS);
        setIsLoading(false);
        return;
      }

      const meta = user.user_metadata || {};
      const onboardingComplete = meta.onboarding_complete === true;
      const onboardingStage = meta.onboarding_stage;

      logger.info("🔍 OnboardingFlow: User metadata check", {
        onboardingComplete,
        onboardingStage,
        userId: user.id,
      });

      let newStage: OnboardingStage;
      let newFlowState: OnboardingFlowState;

      if (onboardingComplete) {
        newStage = OnboardingStage.COMPLETE;
        newFlowState = OnboardingFlowState.COMPLETED;
      } else if (onboardingStage) {
        // Map server stage to enum value
        const mappedStage = mapServerStageToEnum(onboardingStage);
        if (mappedStage) {
          newStage = mappedStage;
          newFlowState = OnboardingFlowState.IN_PROGRESS;
        } else {
          // Default to first stage if mapping fails
          newStage = OnboardingStage.INTENT_Q1;
          newFlowState = OnboardingFlowState.IN_PROGRESS;
        }
      } else {
        // Default to first stage if no valid stage found
        newStage = OnboardingStage.INTENT_Q1;
        newFlowState = OnboardingFlowState.IN_PROGRESS;
      }

      // Set the new state
      setCurrentStage(newStage);
      setFlowState(newFlowState);

      // Save to cache with the correct values
      await saveOnboardingState(newStage, newFlowState);
    } catch (error) {
      logger.error(
        "❌ OnboardingFlow: Error initializing from metadata:",
        error
      );
      setCurrentStage(OnboardingStage.INTENT_Q1);
      setFlowState(OnboardingFlowState.IN_PROGRESS);
    } finally {
      setIsLoading(false);
    }
  };

  // Update stage with optional server sync
  const updateStage = async (
    stage: OnboardingStage,
    saveToServer: boolean = true
  ) => {
    try {
      logger.info("🔄 OnboardingFlow: Updating stage", {
        from: currentStage,
        to: stage,
        saveToServer,
      });

      setCurrentStage(stage);

      if (saveToServer && session?.user) {
        // Get current user metadata to preserve existing values
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const currentMetadata = user?.user_metadata || {};

        // Convert enum to server format
        const serverStage = mapEnumToServerStage(stage);

        await supabase.auth.updateUser({
          data: {
            ...currentMetadata,
            onboarding_stage: serverStage,
          },
        });

        logger.info("✅ OnboardingFlow: Updated stage on server", {
          enumStage: stage,
          serverStage,
        });
      }

      // Save to cache
      await saveOnboardingState(stage, flowState);
    } catch (error) {
      logger.error("❌ OnboardingFlow: Error updating stage:", error);
    }
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    try {
      logger.info("🎉 OnboardingFlow: Completing onboarding");

      setCurrentStage(OnboardingStage.COMPLETE);
      setFlowState(OnboardingFlowState.COMPLETED);

      if (session?.user) {
        // Get current user metadata to preserve existing values
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const currentMetadata = user?.user_metadata || {};

        await supabase.auth.updateUser({
          data: {
            ...currentMetadata,
            onboarding_complete: true,
            onboarding_stage: mapEnumToServerStage(OnboardingStage.COMPLETE),
          },
        });

        logger.info("✅ OnboardingFlow: Onboarding completed on server");
      }

      // Save to cache
      await saveOnboardingState(
        OnboardingStage.COMPLETE,
        OnboardingFlowState.COMPLETED
      );
    } catch (error) {
      logger.error("❌ OnboardingFlow: Error completing onboarding:", error);
    }
  };

  // Reset onboarding
  const resetOnboarding = async () => {
    try {
      logger.info("🔄 OnboardingFlow: Resetting onboarding");

      setCurrentStage(OnboardingStage.INTENT_Q1);
      setFlowState(OnboardingFlowState.IN_PROGRESS);

      if (session?.user) {
        // Get current user metadata to preserve existing values
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const currentMetadata = user?.user_metadata || {};

        await supabase.auth.updateUser({
          data: {
            ...currentMetadata,
            onboarding_complete: false,
            onboarding_stage: mapEnumToServerStage(OnboardingStage.INTENT_Q1),
          },
        });

        logger.info("✅ OnboardingFlow: Onboarding reset on server");
      }

      // Save to cache
      await saveOnboardingState(
        OnboardingStage.INTENT_Q1,
        OnboardingFlowState.IN_PROGRESS
      );

      // Clear pending answers
      await AsyncStorage.removeItem("pending_intent_answers");
    } catch (error) {
      logger.error("❌ OnboardingFlow: Error resetting onboarding:", error);
    }
  };

  // Get next stage
  const getNextStage = (stage: OnboardingStage): OnboardingStage | null => {
    const currentIndex = STAGE_ORDER.indexOf(stage);
    if (currentIndex === -1 || currentIndex === STAGE_ORDER.length - 1) {
      return null;
    }
    return STAGE_ORDER[currentIndex + 1];
  };

  // Get previous stage
  const getPreviousStage = (stage: OnboardingStage): OnboardingStage | null => {
    const currentIndex = STAGE_ORDER.indexOf(stage);
    if (currentIndex <= 0) {
      return null;
    }
    return STAGE_ORDER[currentIndex - 1];
  };

  // Check if stage is valid
  const isStageValid = (stage: string): boolean => {
    return STAGE_ORDER.includes(stage as OnboardingStage);
  };

  // Map server stage values to OnboardingStage enum
  const mapServerStageToEnum = (
    serverStage: string
  ): OnboardingStage | null => {
    switch (serverStage) {
      case "q1":
        return OnboardingStage.INTENT_Q1;
      case "q2":
        return OnboardingStage.INTENT_Q2;
      case "q3":
        return OnboardingStage.INTENT_Q3;
      case "profile":
        return OnboardingStage.PROFILE;
      case "plaid":
        return OnboardingStage.PLAID_CONNECT;
      case "final":
        return OnboardingStage.FINAL;
      case "complete":
        return OnboardingStage.COMPLETE;
      default:
        return null;
    }
  };

  // Map OnboardingStage enum to server stage values
  const mapEnumToServerStage = (stage: OnboardingStage): string => {
    switch (stage) {
      case OnboardingStage.INTENT_Q1:
        return "q1";
      case OnboardingStage.INTENT_Q2:
        return "q2";
      case OnboardingStage.INTENT_Q3:
        return "q3";
      case OnboardingStage.PROFILE:
        return "profile";
      case OnboardingStage.PLAID_CONNECT:
        return "plaid";
      case OnboardingStage.FINAL:
        return "final";
      case OnboardingStage.COMPLETE:
        return "complete";
      default:
        return "q1";
    }
  };

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);

      // Load cached state first for instant UI
      await loadCachedState();

      // Then initialize from server data
      await initializeFromUserMetadata();
    };

    initialize();
  }, [session]);

  // Clear cache when user signs out
  useEffect(() => {
    // Only treat as a real sign-out if we previously had a user session
    if (!session && hadUserRef.current) {
      clearOnboardingCache();
      setCurrentStage(null);
      setFlowState(OnboardingFlowState.IN_PROGRESS);
      logger.info("🚪 OnboardingFlow: User signed out, resetting state");
      hadUserRef.current = false;
      return;
    }

    if (session?.user) {
      hadUserRef.current = true;
    }
  }, [session]);

  const contextValue: OnboardingFlowContextType = {
    currentStage,
    flowState,
    isLoading,
    updateStage,
    completeOnboarding,
    resetOnboarding,
    getNextStage,
    getPreviousStage,
    isStageValid,
    clearOnboardingCache,
  };

  return (
    <OnboardingFlowContext.Provider value={contextValue}>
      {children}
    </OnboardingFlowContext.Provider>
  );
};

export const useOnboardingFlow = (): OnboardingFlowContextType => {
  const context = useContext(OnboardingFlowContext);
  if (context === undefined) {
    throw new Error(
      "useOnboardingFlow must be used within an OnboardingFlowProvider"
    );
  }
  return context;
};

export default OnboardingFlowProvider;
