import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Financify",
  slug: "financify",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/appicon.png",
  scheme: "financify",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  assetBundlePatterns: [
    "**/*"
  ],
  ios: {
    ...config.ios,
    supportsTablet: true,
    usesAppleSignIn: true,
    bundleIdentifier: "com.kartikey08.financify",
    infoPlist: {
      "ITSAppUsesNonExemptEncryption": false
    }
  },
  android: {
    ...config.android,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff"
    }
  },
  web: {
    ...config.web,
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png"
  },
  extra: {
    ...config.extra, // Preserve existing properties including EAS projectId
    router: {
      origin: false
    },
    eas: {
      projectId: "1ec2fed7-76cd-4a3f-ab46-66a01f7ddb65"
    },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  },
  plugins: [
    ...config.plugins || [],
    "expo-router",
    "expo-apple-authentication",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  owner: "kartikey08"
}); 