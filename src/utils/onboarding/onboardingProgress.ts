import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";

export interface OnboardingProgress {
  id: string;
  user_id: string;
  accounts_connected: boolean;
  budget_setup: boolean;
  finny_asked: boolean;
  dismissed: boolean;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStatus {
  progress: OnboardingProgress | null;
  percentage: number;
  isComplete: boolean;
  shouldShow: boolean;
}

/**
 * Get or create onboarding progress for a user
 */
export async function getOnboardingProgress(
  userId: string
): Promise<OnboardingProgress | null> {
  try {
    const { data, error } = await supabase
      .from("onboarding_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("Error fetching onboarding progress:", error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error("Error in getOnboardingProgress:", error);
    return null;
  }
}

/**
 * Create onboarding progress record for a new user
 */
export async function createOnboardingProgress(
  userId: string
): Promise<OnboardingProgress | null> {
  try {
    const { data, error } = await supabase
      .from("onboarding_progress")
      .insert({
        user_id: userId,
        accounts_connected: false,
        budget_setup: false,
        finny_asked: false,
        dismissed: false,
      })
      .select()
      .single();

    if (error) {
      logger.error("Error creating onboarding progress:", error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error("Error in createOnboardingProgress:", error);
    return null;
  }
}

/**
 * Check if user has connected accounts
 */
export async function checkAccountsConnected(
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_items")
      .select("item_id")
      .eq("user_id", userId)
      .limit(1);

    if (error) {
      logger.error("Error checking accounts:", error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (error) {
    logger.error("Error in checkAccountsConnected:", error);
    return false;
  }
}

/**
 * Check if user has set up a budget
 */
export async function checkBudgetSetup(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("budget_periods")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1);

    if (error) {
      logger.error("Error checking budget:", error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (error) {
    logger.error("Error in checkBudgetSetup:", error);
    return false;
  }
}

/**
 * Check if user has asked Finny anything
 */
export async function checkFinnyAsked(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("conversation_logs")
      .select("id")
      .eq("user_id", userId)
      .not("user_message", "is", null)
      .limit(1);

    if (error) {
      logger.error("Error checking conversation logs:", error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (error) {
    logger.error("Error in checkFinnyAsked:", error);
    return false;
  }
}

/**
 * Update onboarding progress with current status
 * Automatically checks all three steps and updates the record
 */
export async function updateOnboardingProgress(
  userId: string
): Promise<OnboardingProgress | null> {
  try {
    // Check all three steps
    const [accountsConnected, budgetSetup, finnyAsked] = await Promise.all([
      checkAccountsConnected(userId),
      checkBudgetSetup(userId),
      checkFinnyAsked(userId),
    ]);

    // Get or create progress record
    let progress = await getOnboardingProgress(userId);
    if (!progress) {
      progress = await createOnboardingProgress(userId);
      if (!progress) {
        return null;
      }
    }

    // Update progress
    const { data, error } = await supabase
      .from("onboarding_progress")
      .update({
        accounts_connected: accountsConnected,
        budget_setup: budgetSetup,
        finny_asked: finnyAsked,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      logger.error("Error updating onboarding progress:", error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error("Error in updateOnboardingProgress:", error);
    return null;
  }
}

/**
 * Dismiss onboarding progress box
 */
export async function dismissOnboardingProgress(
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("onboarding_progress")
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      logger.error("Error dismissing onboarding:", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error in dismissOnboardingProgress:", error);
    return false;
  }
}

/**
 * Reset dismissal (show again on next session if incomplete)
 */
export async function resetOnboardingDismissal(
  userId: string
): Promise<boolean> {
  try {
    const progress = await getOnboardingProgress(userId);
    if (!progress) {
      return false;
    }

    // Only reset if not complete
    const isComplete =
      progress.accounts_connected &&
      progress.budget_setup &&
      progress.finny_asked;

    if (!isComplete) {
      const { error } = await supabase
        .from("onboarding_progress")
        .update({
          dismissed: false,
          dismissed_at: null,
        })
        .eq("user_id", userId);

      if (error) {
        logger.error("Error resetting dismissal:", error);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error("Error in resetOnboardingDismissal:", error);
    return false;
  }
}

/**
 * Calculate onboarding percentage
 */
export function calculateOnboardingPercentage(
  progress: OnboardingProgress | null
): number {
  if (!progress) {
    return 0;
  }

  const steps = [
    progress.accounts_connected,
    progress.budget_setup,
    progress.finny_asked,
  ];

  const completedSteps = steps.filter(Boolean).length;

  if (completedSteps === 0) return 0;
  if (completedSteps === 1) return 33;
  if (completedSteps === 2) return 66;
  if (completedSteps === 3) return 100;

  return 0;
}

/**
 * Get complete onboarding status
 */
export async function getOnboardingStatus(
  userId: string
): Promise<OnboardingStatus> {
  try {
    // Get or create progress
    let progress = await getOnboardingProgress(userId);
    if (!progress) {
      progress = await createOnboardingProgress(userId);
    }

    // Update with current status
    if (progress) {
      progress = await updateOnboardingProgress(userId);
    }

    if (!progress) {
      return {
        progress: null,
        percentage: 0,
        isComplete: false,
        shouldShow: true,
      };
    }

    const percentage = calculateOnboardingPercentage(progress);
    const isComplete =
      progress.accounts_connected &&
      progress.budget_setup &&
      progress.finny_asked;

    // Should show if:
    // - Not complete AND
    // - Not dismissed OR dismissed but it's a new session (we'll reset dismissal on app start)
    const shouldShow = !isComplete && !progress.dismissed;

    return {
      progress,
      percentage,
      isComplete,
      shouldShow,
    };
  } catch (error) {
    logger.error("Error in getOnboardingStatus:", error);
    return {
      progress: null,
      percentage: 0,
      isComplete: false,
      shouldShow: true,
    };
  }
}
