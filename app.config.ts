import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Finny",
  slug: "financify",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/appicon.png",
  scheme: ["finny", "financify"],
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/main1.png",
    resizeMode: "contain",
    backgroundColor: "#0A0E14"
  },
  assetBundlePatterns: [
    "**/*"
  ],
  ios: {
    ...config.ios,
    supportsTablet: true,
    usesAppleSignIn: true,
    bundleIdentifier: "com.deltatechnologies.financify",
    infoPlist: {
      "ITSAppUsesNonExemptEncryption": false,
      "NSAppTransportSecurity": {
        "NSAllowsArbitraryLoads": true,
        "NSAllowsLocalNetworking": true
      }
    }
  },
  android: {
    ...config.android,
    package: "com.deltatechnologies.financify",
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
    supabaseServiceRoleKey: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
    revenuecatIosApiKeyTest: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY_TEST || process.env.REVENUECAT_IOS_API_KEY_TEST,
    revenuecatIosApiKeyProd: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY_PROD || process.env.REVENUECAT_IOS_API_KEY_PROD,
  },
  plugins: [
    ...config.plugins || [],
    "expo-router",
    "expo-apple-authentication",
    "expo-font",
    "expo-localization",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/main1.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0A0E14"
      }
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/mascotgpt.png",
        color: "#4A90E2",
        defaultChannel: "default"
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  owner: "kartikey08"
}); 