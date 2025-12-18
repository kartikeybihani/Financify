/**
 * Utility functions for handling Supabase authentication tokens
 * 
 * This module provides a reliable way to get fresh access tokens,
 * handling token refresh automatically and preventing stale token issues.
 */

import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * In-memory token cache to avoid redundant getSession() calls.
 * Tokens are cached until explicitly invalidated (e.g., on TOKEN_REFRESHED event).
 */
let tokenCache: {
  token: string;
  timestamp: number;
} | null = null;

/**
 * Token refresh coordinator - manages the refresh lifecycle to prevent race conditions.
 * 
 * When a token refresh is in progress:
 * - Queues token requests instead of making concurrent getSession() calls
 * - Provides a promise that resolves when refresh completes with the new token
 * - Prevents multiple concurrent refresh operations
 */
type RefreshState = {
  isRefreshing: boolean;
  refreshPromise: Promise<string | null> | null;
  newToken: string | null;
  startTime: number;
};

let refreshCoordinator: RefreshState = {
  isRefreshing: false,
  refreshPromise: null,
  newToken: null,
  startTime: 0,
};

/**
 * Starts a token refresh operation in the coordinator.
 * Returns a promise that resolves when refresh completes with the new token.
 * 
 * @param refreshFn - Async function that performs the refresh and returns the new token
 * @returns Promise resolving to the new token, or null if refresh failed
 */
export const startTokenRefresh = async (
  refreshFn: () => Promise<string | null>
): Promise<string | null> => {
  // If refresh already in progress, return the existing promise
  if (refreshCoordinator.isRefreshing && refreshCoordinator.refreshPromise) {
    return refreshCoordinator.refreshPromise;
  }

  refreshCoordinator.isRefreshing = true;
  refreshCoordinator.startTime = Date.now();
  refreshCoordinator.newToken = null;

  // Create the refresh promise
  refreshCoordinator.refreshPromise = (async () => {
    try {
      // Invalidate cache immediately to prevent stale token usage
      tokenCache = null;

      // Wait a brief moment for Supabase to complete internal refresh
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Execute the refresh function
      const newToken = await refreshFn();

      if (newToken) {
        refreshCoordinator.newToken = newToken;
        // Update cache with new token
        tokenCache = {
          token: newToken,
          timestamp: Date.now(),
        };
      }

      return newToken;
    } catch (error) {
      logger.error("[AUTH_TOKEN] Token refresh failed:", error);
      return null;
    } finally {
      // Reset coordinator after a brief delay to allow queued requests to complete
      setTimeout(() => {
        refreshCoordinator.isRefreshing = false;
        refreshCoordinator.refreshPromise = null;
        refreshCoordinator.newToken = null;
      }, 100);
    }
  })();

  return refreshCoordinator.refreshPromise;
};

/**
 * Invalidates the in-memory token cache.
 * Should be called when TOKEN_REFRESHED event fires to ensure fresh tokens are used.
 */
export const invalidateTokenCache = () => {
  if (tokenCache) {
    tokenCache = null;
  }
};

/**
 * Creates a promise that rejects after a specified timeout duration.
 * Used to prevent infinite hangs when Supabase operations get stuck.
 * 
 * @param ms - Timeout duration in milliseconds
 * @param message - Error message to include in rejection
 * @returns Promise that rejects after the timeout
 */
const createTimeoutPromise = (ms: number, message: string): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

/**
 * Retrieves a fresh access token from Supabase with in-memory caching and robust error handling.
 * 
 * This function implements a performance-optimized token retrieval system with refresh coordination:
 * - Uses in-memory cache to avoid redundant getSession() calls (instant on cache hit)
 * - If token refresh is in progress, queues the request and waits for refresh to complete
 * - Cache is invalidated automatically on TOKEN_REFRESHED events to ensure freshness
 * - Falls back to getSession() on cache miss (with refresh-aware timeout protection)
 * - Uses getSession() instead of getUser() to avoid blocking during token refresh
 * - Implements adaptive timeout: longer during refresh, shorter otherwise
 * - Retries up to 3 times with exponential backoff if no token is found
 * - Falls back to reading directly from AsyncStorage only if refresh is not in progress
 * - Never throws errors - always returns null on failure, letting calling code decide next steps
 * 
 * The refresh coordination prevents race conditions where multiple components try to get tokens
 * simultaneously during refresh, causing all getSession() calls to timeout.
 * 
 * @returns Promise resolving to the access token string, or null if unavailable
 */
export const getFreshAccessToken = async (): Promise<string | null> => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 200;
  const NORMAL_TIMEOUT_MS = 2000;
  const REFRESH_TIMEOUT_MS = 5000; // Longer timeout during refresh
  const callId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();

  // Check if refresh is in progress - if so, queue this request
  if (refreshCoordinator.isRefreshing && refreshCoordinator.refreshPromise) {
    try {
      const newToken = await refreshCoordinator.refreshPromise;
      if (newToken) {
        return newToken;
      }
    } catch (error) {
      // Fall through to getSession()
    }
  }

  // Check cache (may have been updated by refresh coordinator)
  if (tokenCache) {
    const cacheAge = Date.now() - tokenCache.timestamp;
    // Don't use cache if it's older than 2 minutes (tokens can be invalidated by refresh at any time)
    if (cacheAge < 2 * 60 * 1000) {
      return tokenCache.token;
    } else {
      tokenCache = null;
    }
  }
  
  // Determine timeout based on whether refresh is in progress
  const isRefreshing = refreshCoordinator.isRefreshing;
  const GET_SESSION_TIMEOUT_MS = isRefreshing ? REFRESH_TIMEOUT_MS : NORMAL_TIMEOUT_MS;
  
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const getSessionStartTime = Date.now();
      try {
        const getSessionPromise = supabase.auth.getSession();
        const timeoutPromise = createTimeoutPromise(
          GET_SESSION_TIMEOUT_MS,
          `getSession() timeout after ${GET_SESSION_TIMEOUT_MS}ms`
        );
        
        const result = await Promise.race([getSessionPromise, timeoutPromise]);
        
        // Type guard: timeoutPromise always rejects, so if we reach here, result is from getSessionPromise
        if (result instanceof Error) {
          throw result;
        }
        
        const { data: { session }, error } = result;

        if (error) {
          logger.error(`[AUTH_TOKEN] Error getting session:`, error);
          return null;
        }

        if (session?.access_token) {
          tokenCache = {
            token: session.access_token,
            timestamp: Date.now(),
          };
          return session.access_token;
        }

        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      } catch (timeoutError: any) {
        const getSessionDuration = Date.now() - getSessionStartTime;
        if (timeoutError?.message?.includes('timeout')) {
          if (attempt === MAX_RETRIES - 1) {
            logger.warn(`[AUTH_TOKEN] ⏱️ [${callId}] getSession() TIMEOUT after ${getSessionDuration}ms (final attempt ${attempt + 1}/${MAX_RETRIES})`);
          } else {
            logger.warn(`[AUTH_TOKEN] ⏱️ [${callId}] getSession() TIMEOUT after ${getSessionDuration}ms (attempt ${attempt + 1}/${MAX_RETRIES}), will retry...`);
          }
          
          // Only use AsyncStorage fallback if refresh is NOT in progress (to avoid stale tokens)
          if (attempt === MAX_RETRIES - 1 && !refreshCoordinator.isRefreshing) {
            logger.warn(`[AUTH_TOKEN] 🔄 [${callId}] getSession() timed out, trying AsyncStorage fallback...`);
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const authKeys = allKeys.filter(key => key.includes('auth-token') || key.includes('supabase.auth'));
              
              for (const key of authKeys) {
                try {
                  const stored = await AsyncStorage.getItem(key);
                  if (stored) {
                    const parsed = JSON.parse(stored);
                    const token = parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
                    if (token) {
                      const totalDuration = Date.now() - startTime;
                      tokenCache = {
                        token: token,
                        timestamp: Date.now(),
                      };
                      logger.info(`[AUTH_TOKEN] ✅ [${callId}] Got token from AsyncStorage fallback (key: ${key}) in ${totalDuration}ms and cached`);
                      return token;
                    }
                  }
                } catch (parseError) {
                  continue;
                }
              }
            } catch (storageError) {
              logger.error(`[AUTH_TOKEN] ❌ [${callId}] AsyncStorage fallback failed:`, storageError);
            }
            
            const totalDuration = Date.now() - startTime;
            logger.error(`[AUTH_TOKEN] ❌ [${callId}] getSession() timed out on all attempts (total: ${totalDuration}ms) - Supabase may be stuck`);
            return null;
          } else if (attempt === MAX_RETRIES - 1 && refreshCoordinator.isRefreshing) {
            logger.warn(`[AUTH_TOKEN] ⚠️ [${callId}] Skipping AsyncStorage fallback - refresh in progress (would return stale token)`);
            return null;
          }
          
          logger.info(`[AUTH_TOKEN] ⏳ [${callId}] Waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          logger.error(`[AUTH_TOKEN] ❌ [${callId}] Unexpected error in getSession():`, timeoutError);
          return null;
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.warn(`[AUTH_TOKEN] ⚠️ [${callId}] No access token after ${MAX_RETRIES} retries (took ${totalDuration}ms)`);
    return null;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error(`[AUTH_TOKEN] ❌ [${callId}] Exception getting fresh token (took ${totalDuration}ms):`, error);
    return null;
  }
};

/**
 * Makes an authenticated HTTP request with automatic token refresh and retry logic.
 * 
 * This function wraps fetch() with authentication headers and handles token refresh scenarios:
 * - Automatically gets a fresh token for each request attempt
 * - Retries on 401 Unauthorized errors (up to maxRetries times) to handle token refresh delays
 * - Includes comprehensive logging for debugging authentication issues
 * - Throws errors only when authentication is definitively unavailable
 * 
 * The retry mechanism is important because token refresh can take a moment, and 401 errors
 * during refresh should trigger a retry rather than immediate failure.
 * 
 * @param url - The API endpoint URL to request
 * @param options - Standard fetch RequestInit options (method, body, headers, etc.)
 * @param maxRetries - Maximum number of retries on 401 errors (default: 2)
 * @returns Promise resolving to the Response object
 * @throws Error if authentication fails after all retries
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
  maxRetries: number = 2
): Promise<Response> => {
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    const accessToken = await getFreshAccessToken();
    
    if (!accessToken) {
      throw new Error('Not authenticated - no access token available');
    }
    
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Content-Type', 'application/json');
    
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    if (response.status === 401 && retryCount < maxRetries) {
      invalidateTokenCache();
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 300 * retryCount));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Failed to authenticate after retries');
};

/**
 * Validates that the current session is valid and has a valid access token.
 * 
 * This performs a full validation by checking both the token availability and
 * verifying it with Supabase's getUser() endpoint. Use this sparingly as getUser()
 * can be slow; prefer getFreshAccessToken() for most use cases.
 * 
 * @returns Promise resolving to true if session is valid, false otherwise
 */
export const isSessionValid = async (): Promise<boolean> => {
  try {
    const token = await getFreshAccessToken();
    if (!token) return false;
    
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && !!user?.id;
  } catch (error) {
    logger.error('[AUTH_TOKEN] Error validating session:', error);
    return false;
  }
};
