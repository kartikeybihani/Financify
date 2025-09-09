import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys for Snaptrade credentials
const SNAPTRADE_USER_ID_KEY = 'snaptrade_user_id';
const SNAPTRADE_USER_SECRET_KEY = 'snaptrade_user_secret';
const SNAPTRADE_CONNECTION_TIMESTAMP_KEY = 'snaptrade_connection_timestamp';

export interface SnaptradeCredentials {
  userId: string;
  userSecret: string;
  connectionTimestamp: number;
}

/**
 * Store Snaptrade credentials in AsyncStorage
 */
export const storeSnaptradeCredentials = async (
  userId: string,
  userSecret: string
): Promise<void> => {
  try {
    const timestamp = Date.now();
    
    await Promise.all([
      AsyncStorage.setItem(SNAPTRADE_USER_ID_KEY, userId),
      AsyncStorage.setItem(SNAPTRADE_USER_SECRET_KEY, userSecret),
      AsyncStorage.setItem(SNAPTRADE_CONNECTION_TIMESTAMP_KEY, timestamp.toString())
    ]);
    
    console.log('✅ Snaptrade credentials stored successfully:', {
      userId,
      userSecret: userSecret.substring(0, 8) + '...', // Log partial secret for security
      timestamp: new Date(timestamp).toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to store Snaptrade credentials:', error);
    throw new Error('Failed to store Snaptrade credentials');
  }
};

/**
 * Retrieve Snaptrade credentials from AsyncStorage
 */
export const getSnaptradeCredentials = async (): Promise<SnaptradeCredentials | null> => {
  try {
    const [userId, userSecret, timestampStr] = await Promise.all([
      AsyncStorage.getItem(SNAPTRADE_USER_ID_KEY),
      AsyncStorage.getItem(SNAPTRADE_USER_SECRET_KEY),
      AsyncStorage.getItem(SNAPTRADE_CONNECTION_TIMESTAMP_KEY)
    ]);
    
    if (!userId || !userSecret || !timestampStr) {
      console.log('ℹ️ No Snaptrade credentials found in storage');
      return null;
    }
    
    const credentials: SnaptradeCredentials = {
      userId,
      userSecret,
      connectionTimestamp: parseInt(timestampStr, 10)
    };
    
    console.log('✅ Snaptrade credentials retrieved:', {
      userId,
      userSecret: userSecret.substring(0, 8) + '...',
      connectionTimestamp: new Date(credentials.connectionTimestamp).toISOString()
    });
    
    return credentials;
  } catch (error) {
    console.error('❌ Failed to retrieve Snaptrade credentials:', error);
    return null;
  }
};

/**
 * Check if Snaptrade credentials exist in storage
 */
export const hasSnaptradeCredentials = async (): Promise<boolean> => {
  try {
    const credentials = await getSnaptradeCredentials();
    return credentials !== null;
  } catch (error) {
    console.error('❌ Failed to check Snaptrade credentials:', error);
    return false;
  }
};

/**
 * Clear Snaptrade credentials from AsyncStorage
 */
export const clearSnaptradeCredentials = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(SNAPTRADE_USER_ID_KEY),
      AsyncStorage.removeItem(SNAPTRADE_USER_SECRET_KEY),
      AsyncStorage.removeItem(SNAPTRADE_CONNECTION_TIMESTAMP_KEY)
    ]);
    
    console.log('✅ Snaptrade credentials cleared from storage');
  } catch (error) {
    console.error('❌ Failed to clear Snaptrade credentials:', error);
    throw new Error('Failed to clear Snaptrade credentials');
  }
};

/**
 * Get connection age in days
 */
export const getSnaptradeConnectionAge = async (): Promise<number | null> => {
  try {
    const credentials = await getSnaptradeCredentials();
    if (!credentials) return null;
    
    const now = Date.now();
    const ageInMs = now - credentials.connectionTimestamp;
    const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
    
    return ageInDays;
  } catch (error) {
    console.error('❌ Failed to get Snaptrade connection age:', error);
    return null;
  }
};

/**
 * Check if credentials are still valid (less than 90 days old)
 */
export const areSnaptradeCredentialsValid = async (): Promise<boolean> => {
  try {
    const age = await getSnaptradeConnectionAge();
    if (age === null) return false;
    
    // Consider credentials valid for 90 days
    return age < 90;
  } catch (error) {
    console.error('❌ Failed to validate Snaptrade credentials:', error);
    return false;
  }
};
