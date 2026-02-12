// Centralized API URL detection
// Uses Vercel environment variables to automatically select the correct URL

/**
 * Get the base API URL for the current environment
 * 
 * Priority:
 * 1. EXPO_PUBLIC_APP_BASE_URL_DEV - for preview/development (set in Vercel Preview env)
 * 2. EXPO_PUBLIC_APP_BASE_URL - for production (set in Vercel Production env)
 * 3. Default fallback to production URL
 * 
 * Vercel automatically injects the correct variable based on deployment environment:
 * - Production deployments → EXPO_PUBLIC_APP_BASE_URL
 * - Preview deployments → EXPO_PUBLIC_APP_BASE_URL_DEV (if set)
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  // 1. Check for dev/preview URL first (for preview deployments)
  const devUrl = process.env.EXPO_PUBLIC_APP_BASE_URL_DEV;
  if (devUrl) {
    // @ts-ignore - __DEV__ is a global in React Native
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`🔧 Using preview/dev API URL: ${trimTrailingSlash(devUrl)}`);
    }
    return trimTrailingSlash(devUrl);
  }

  // 2. Check for production URL (for production deployments)
  const prodUrl = process.env.EXPO_PUBLIC_APP_BASE_URL;
  if (prodUrl) {
    // @ts-ignore - __DEV__ is a global in React Native
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`🔧 Using production API URL: ${trimTrailingSlash(prodUrl)}`);
    }
    return trimTrailingSlash(prodUrl);
  }

  // 3. Fallback to hardcoded production URL (shouldn't happen if env vars are set)
  const fallbackUrl = 'https://financify-rose.vercel.app';
  // @ts-ignore - __DEV__ is a global in React Native
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`⚠️ No API URL env vars found, using fallback: ${fallbackUrl}`);
  }
  return fallbackUrl;
}

/**
 * Get the current environment name for logging/debugging
 */
export function getApiEnvironment(): string {
  const url = getApiBaseUrl();
  if (url.includes('financify-rose.vercel.app') && !url.includes('git-')) {
    return 'production';
  }
  if (url.includes('git-') || url.includes('preview')) {
    return 'preview';
  }
  return 'custom';
}

// Export the base URL as a constant for direct imports
export const API_BASE_URL = getApiBaseUrl();
