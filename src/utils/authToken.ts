/**
 * Utility functions for handling Supabase authentication tokens
 * 
 * This module provides a reliable way to get fresh access tokens,
 * handling token refresh automatically and preventing stale token issues.
 */

import { supabase } from '@/src/lib/supabase/supabase';
import logger from '@/src/utils/logger';

/**
 * Get a fresh access token from Supabase
 * Always fetches the latest token from Supabase client, never uses cached state
 * 
 * @returns Promise<string | null> - The access token or null if not authenticated
 */
export const getFreshAccessToken = async (): Promise<string | null> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      logger.error('[AUTH_TOKEN] Error getting session:', error);
      return null;
    }
    
    if (!session?.access_token) {
      logger.warn('[AUTH_TOKEN] No access token in session');
      return null;
    }
    
    return session.access_token;
  } catch (error) {
    logger.error('[AUTH_TOKEN] Exception getting fresh token:', error);
    return null;
  }
};

/**
 * Make an authenticated API request with automatic token refresh retry
 * 
 * @param url - The API endpoint URL
 * @param options - Fetch options (method, headers, body, etc.)
 * @param maxRetries - Maximum number of retries on 401 errors (default: 2)
 * @returns Promise<Response> - The fetch response
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
  maxRetries: number = 2
): Promise<Response> => {
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    // Get fresh token for each attempt
    const accessToken = await getFreshAccessToken();
    
    if (!accessToken) {
      throw new Error('Not authenticated - no access token available');
    }
    
    // Merge headers, ensuring Authorization header is set
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Content-Type', 'application/json');
    
    // Make the request
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // If unauthorized and we have retries left, wait and retry
    if (response.status === 401 && retryCount < maxRetries) {
      retryCount++;
      logger.warn(`[AUTH_TOKEN] 401 error, retrying (${retryCount}/${maxRetries})...`);
      
      // Wait a bit for token refresh to complete
      await new Promise(resolve => setTimeout(resolve, 300 * retryCount));
      continue;
    }
    
    // Return response (success or final failure)
    return response;
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Failed to authenticate after retries');
};

/**
 * Check if the current session is valid and has a valid access token
 * 
 * @returns Promise<boolean> - True if session is valid
 */
export const isSessionValid = async (): Promise<boolean> => {
  try {
    const token = await getFreshAccessToken();
    if (!token) return false;
    
    // Verify token is valid by checking user
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && !!user?.id;
  } catch (error) {
    logger.error('[AUTH_TOKEN] Error validating session:', error);
    return false;
  }
};

