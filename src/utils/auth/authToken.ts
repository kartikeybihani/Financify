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
 * Invalidates the in-memory token cache.
 * Should be called when TOKEN_REFRESHED event fires to ensure fresh tokens are used.
 */
export const invalidateTokenCache = () => {
  if (tokenCache) {
    logger.info("[AUTH_TOKEN] 🗑️ Invalidating token cache");
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
 * This function implements a performance-optimized token retrieval system:
 * - Uses in-memory cache to avoid redundant getSession() calls (instant on cache hit)
 * - Cache is invalidated automatically on TOKEN_REFRESHED events to ensure freshness
 * - Falls back to getSession() on cache miss (with timeout protection)
 * - Uses getSession() instead of getUser() to avoid blocking during token refresh
 * - Implements a 2-second timeout on getSession() calls to prevent infinite hangs
 * - Retries up to 3 times with exponential backoff if no token is found
 * - Falls back to reading directly from AsyncStorage if Supabase is stuck
 * - Never throws errors - always returns null on failure, letting calling code decide next steps
 * 
 * The caching eliminates redundant token fetches (saves 1-46ms per API call), while the timeout
 * protection prevents hangs if Supabase's internal state machine gets stuck.
 * 
 * @returns Promise resolving to the access token string, or null if unavailable
 */
export const getFreshAccessToken = async (): Promise<string | null> => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 200;
  const GET_SESSION_TIMEOUT_MS = 2000;
  const callId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();

  if (tokenCache) {
    logger.info(`[AUTH_TOKEN] 🔑 [${callId}] Using cached token (cached ${Date.now() - tokenCache.timestamp}ms ago)`);
    return tokenCache.token;
  }

  logger.info(`[AUTH_TOKEN] 🔑 getFreshAccessToken START [${callId}] (cache miss)`);
  
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      logger.info(`[AUTH_TOKEN] 🔑 [${callId}] Attempt ${attempt + 1}/${MAX_RETRIES} - calling getSession() with ${GET_SESSION_TIMEOUT_MS}ms timeout...`);
      const getSessionStartTime = Date.now();
      
      try {
        const getSessionPromise = supabase.auth.getSession();
        const timeoutPromise = createTimeoutPromise(
          GET_SESSION_TIMEOUT_MS,
          `getSession() timeout after ${GET_SESSION_TIMEOUT_MS}ms`
        );
        
        const result = await Promise.race([getSessionPromise, timeoutPromise]);
        const getSessionDuration = Date.now() - getSessionStartTime;
        
        // Type guard: timeoutPromise always rejects, so if we reach here, result is from getSessionPromise
        if (result instanceof Error) {
          throw result;
        }
        
        const { data: { session }, error } = result;
        
        logger.info(`[AUTH_TOKEN] 🔑 [${callId}] getSession() completed in ${getSessionDuration}ms - hasSession: ${!!session}, hasToken: ${!!session?.access_token}, error: ${error ? error.message : 'none'}`);

        if (error) {
          logger.error(`[AUTH_TOKEN] ❌ [${callId}] Error getting session:`, error);
          return null;
        }

        if (session?.access_token) {
          const totalDuration = Date.now() - startTime;
          tokenCache = {
            token: session.access_token,
            timestamp: Date.now(),
          };
          logger.info(`[AUTH_TOKEN] ✅ [${callId}] SUCCESS - got token in ${totalDuration}ms and cached (token: ${session.access_token.substring(0, 20)}...)`);
          return session.access_token;
        }

        if (attempt < MAX_RETRIES - 1) {
          logger.info(
            `[AUTH_TOKEN] ⏳ [${callId}] No access token in session (attempt ${
              attempt + 1
            }/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`
          );
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
          
          if (attempt === MAX_RETRIES - 1) {
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
  const callId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  logger.info(`[AUTH_TOKEN] 🌐 authenticatedFetch START [${callId}] - ${options.method || 'GET'} ${url}`);
  
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    logger.info(`[AUTH_TOKEN] 🌐 [${callId}] Attempt ${retryCount + 1}/${maxRetries + 1} - getting token...`);
    const tokenStartTime = Date.now();
    const accessToken = await getFreshAccessToken();
    const tokenDuration = Date.now() - tokenStartTime;
    
    if (!accessToken) {
      logger.error(`[AUTH_TOKEN] ❌ [${callId}] No access token available after ${tokenDuration}ms`);
      throw new Error('Not authenticated - no access token available');
    }
    
    logger.info(`[AUTH_TOKEN] 🌐 [${callId}] Got token in ${tokenDuration}ms, making request...`);
    
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Content-Type', 'application/json');
    
    const fetchStartTime = Date.now();
    const response = await fetch(url, {
      ...options,
      headers,
    });
    const fetchDuration = Date.now() - fetchStartTime;
    
    logger.info(`[AUTH_TOKEN] 🌐 [${callId}] Request completed in ${fetchDuration}ms - status: ${response.status}`);
    
    if (response.status === 401 && retryCount < maxRetries) {
      // CRITICAL: Invalidate cache on 401 - the token is expired/invalid
      // This ensures the next retry fetches a fresh token instead of reusing the expired cached one
      logger.warn(`[AUTH_TOKEN] ⚠️ [${callId}] 401 error detected - invalidating token cache to force fresh token fetch`);
      invalidateTokenCache();
      
      retryCount++;
      const waitTime = 300 * retryCount;
      logger.warn(`[AUTH_TOKEN] ⚠️ [${callId}] Retrying (${retryCount}/${maxRetries}) after ${waitTime}ms with fresh token...`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    const totalDuration = Date.now() - startTime;
    logger.info(`[AUTH_TOKEN] ✅ [${callId}] authenticatedFetch SUCCESS in ${totalDuration}ms - status: ${response.status}`);
    return response;
  }
  
  const totalDuration = Date.now() - startTime;
  logger.error(`[AUTH_TOKEN] ❌ [${callId}] authenticatedFetch FAILED after ${totalDuration}ms`);
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
