import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Financify",
  slug: "financify",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#121212"
  },
  assetBundlePatterns: [
    "**/*"
  ],
  ios: {
    ...config.ios,
    supportsTablet: true
  },
  android: {
    ...config.android,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#121212"
    }
  },
  web: {
    ...config.web,
    favicon: "./assets/favicon.png"
  },
  extra: {
    ...config.extra, // Preserve existing properties including EAS projectId
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  plugins: [
    ...config.plugins || [],
    "expo-router"
  ]
}); 