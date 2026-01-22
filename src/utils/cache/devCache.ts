// Development cache utilities for hot reload persistence
import AppStorage from "@/src/utils/storage/storage";

/**
 * Clear all app-related cache from AsyncStorage
 * Useful during development or when debugging
 */
export const clearAppCache = async () => {
  try {
    const keys = [
      'onboarding_complete',
      'user_authenticated', 
      'userData',
      'plaid_data',
      'financial_data',
      'last_sync_timestamp'
    ];
    
    AppStorage.multiRemoveSync(keys);
    console.log("🗑️ Cleared all app cache from AsyncStorage");
    return true;
  } catch (error) {
    console.error("❌ Error clearing app cache:", error);
    return false;
  }
};

/**
 * Set development flags for faster hot reload recovery
 */
export const setDevFlags = async (userId: string) => {
  try {
    AppStorage.setItemSync('onboarding_complete', 'true');
    AppStorage.setItemSync('user_authenticated', 'true');
    AppStorage.setItemSync('dev_user_id', userId);
    console.log("✅ Set development flags for user:", userId);
  } catch (error) {
    console.error("❌ Error setting dev flags:", error);
  }
};

/**
 * Get development status
 */
export const getDevStatus = async () => {
  try {
    // Use synchronous reads
    const onboardingComplete = ['onboarding_complete', AppStorage.getItemSync('onboarding_complete')];
    const userAuth = ['user_authenticated', AppStorage.getItemSync('user_authenticated')];
    const devUserId = ['dev_user_id', AppStorage.getItemSync('dev_user_id')];
    
    return {
      onboardingComplete: onboardingComplete[1] === 'true',
      userAuthenticated: userAuth[1] === 'true',
      devUserId: devUserId[1]
    };
  } catch (error) {
    console.error("❌ Error getting dev status:", error);
    return {
      onboardingComplete: false,
      userAuthenticated: false,
      devUserId: null
    };
  }
};

/**
 * Reset app to onboarding state (useful for testing)
 */
export const resetToOnboarding = async () => {
  try {
    await clearAppCache();
    console.log("🔄 Reset app to onboarding state");
  } catch (error) {
    console.error("❌ Error resetting to onboarding:", error);
  }
};
