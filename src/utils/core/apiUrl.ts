// Centralized API URL detection
// Uses Vercel environment variables to automatically select the correct URL

/**
 * Get the base API URL for the current environment.
 *
 * Priority:
 * 1. `EXPO_PUBLIC_APP_BASE_URL_DEV` in local/dev runtime only (`__DEV__ === true`)
 * 2. `EXPO_PUBLIC_APP_BASE_URL` in release/runtime builds
 * 3. `EXPO_PUBLIC_APP_BASE_URL_DEV` fallback (for internal preview builds)
 * 4. Hardcoded production URL fallback
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const devUrl = process.env.EXPO_PUBLIC_APP_BASE_URL_DEV;
  const prodUrl = process.env.EXPO_PUBLIC_APP_BASE_URL;
  // @ts-ignore - __DEV__ is a global in React Native
  const isDevRuntime = typeof __DEV__ !== "undefined" && __DEV__;

  // Use preview/dev URL only in dev runtime (Expo Go/dev client).
  // In release builds (including TestFlight), prefer production URL.
  if (isDevRuntime && devUrl) {
    console.log(`🔧 Using preview/dev API URL: ${trimTrailingSlash(devUrl)}`);
    return trimTrailingSlash(devUrl);
  }

  if (prodUrl) {
    if (isDevRuntime) {
      console.log(`🔧 Using production API URL: ${trimTrailingSlash(prodUrl)}`);
    }
    return trimTrailingSlash(prodUrl);
  }

  // Fallback to preview/dev URL if production URL is not configured
  if (devUrl) {
    if (isDevRuntime) {
      console.warn(
        `⚠️ Production API URL missing, using preview/dev URL: ${trimTrailingSlash(devUrl)}`,
      );
    }
    return trimTrailingSlash(devUrl);
  }

  // Final fallback
  const fallbackUrl = "https://financify-rose.vercel.app";
  if (isDevRuntime) {
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
