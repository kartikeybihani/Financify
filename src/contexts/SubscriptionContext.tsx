import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, { CustomerInfo } from "react-native-purchases";
import type { LOG_LEVEL } from "react-native-purchases";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { ENTITLEMENT_ID } from "@/src/constants/subscription";

const extra = Constants.expoConfig?.extra as Record<string, string | undefined>;
const isDev = __DEV__;

// Get API keys
const testKey = extra?.revenuecatIosApiKeyTest;
const prodKey = extra?.revenuecatIosApiKeyProd;

// Use dev mode (test key) if available, otherwise fallback to production
const revenueCatApiKey =
  Platform.OS === "ios"
    ? testKey || prodKey // Use test key first (dev mode), fallback to prod if test not available
    : null;

// Log environment setup
console.log("[RevenueCat] 🔧 Environment Setup:", {
  isDev,
  platform: Platform.OS,
  hasTestKey: !!testKey,
  hasProdKey: !!prodKey,
  testKeyPrefix: testKey?.substring(0, 15),
  prodKeyPrefix: prodKey?.substring(0, 15),
  selectedKey: revenueCatApiKey
    ? `${revenueCatApiKey.substring(0, 15)}...`
    : "NONE",
  keyType: revenueCatApiKey?.toLowerCase().includes("test")
    ? "TEST"
    : "PROD (App Store)",
  usingAppStoreKey: !!prodKey && revenueCatApiKey === prodKey,
});

export interface SubscriptionContextValue {
  isPremium: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
  applyCustomerInfo: (info: CustomerInfo) => void;
  showPaywall: () => void;
  hidePaywall: () => void;
  paywallVisible: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const updateFromCustomerInfo = useCallback((info: CustomerInfo | null) => {
    if (!info) {
      console.log("[RevenueCat] 📊 CustomerInfo: null → isPremium = false");
      setIsPremium(false);
      return;
    }
    const active = info.entitlements.active[ENTITLEMENT_ID] != null;
    console.log(
      `[RevenueCat] 📊 CustomerInfo: entitlement "${ENTITLEMENT_ID}" = ${active ? "ACTIVE" : "INACTIVE"}`,
    );
    setIsPremium(active);
  }, []);

  const refetch = useCallback(async () => {
    console.log("[RevenueCat] 🔄 Refetch called");
    if (!revenueCatApiKey || Platform.OS !== "ios") {
      console.log("[RevenueCat] ⏭️ Refetch skipped (no key or not iOS)");
      setIsLoading(false);
      return;
    }
    try {
      const configured = await Purchases.isConfigured();
      console.log(`[RevenueCat] 🔄 Refetch: configured = ${configured}`);
      if (!configured) {
        console.warn("[RevenueCat] ⚠️ Refetch: SDK not configured");
        return;
      }
      console.log("[RevenueCat] 🔄 Invalidating cache...");
      await Purchases.invalidateCustomerInfoCache();
      console.log("[RevenueCat] 🔄 Fetching customer info...");
      const info = await Purchases.getCustomerInfo();
      console.log(`[RevenueCat] 🔄 CustomerInfo received:`, {
        entitlements: Object.keys(info.entitlements.active),
        hasPremium: info.entitlements.active[ENTITLEMENT_ID] != null,
      });
      updateFromCustomerInfo(info);
    } catch (e) {
      console.error("[RevenueCat] ❌ Refetch failed:", e);
      logger.warn("Subscription refetch failed", e);
    } finally {
      setIsLoading(false);
    }
  }, [updateFromCustomerInfo]);

  const applyCustomerInfo = useCallback(
    (info: CustomerInfo) => {
      console.log("[RevenueCat] ✅ Applying CustomerInfo immediately");
      updateFromCustomerInfo(info);
    },
    [updateFromCustomerInfo],
  );

  useEffect(() => {
    if (!revenueCatApiKey || Platform.OS !== "ios") {
      console.log("[RevenueCat] ⏭️ Setup skipped (no key or not iOS)");
      setIsLoading(false);
      return;
    }

    console.log("[RevenueCat] 🚀 Starting setup...");

    // Configure log handler
    Purchases.setLogHandler((logLevel: LOG_LEVEL, message: string) => {
      const msg = `[RevenueCat] ${message}`;
      switch (logLevel) {
        case "ERROR":
          console.error(msg);
          break;
        case "WARN":
          console.warn(msg);
          break;
        case "INFO":
          console.info(msg);
          break;
        case "DEBUG":
        case "VERBOSE":
        default:
          console.debug(msg);
          break;
      }
    });

    let cancelled = false;
    const setup = async () => {
      try {
        console.log("[RevenueCat] 🔍 Checking if already configured...");
        const alreadyConfigured = await Purchases.isConfigured();
        console.log(`[RevenueCat] 🔍 Already configured: ${alreadyConfigured}`);

        if (cancelled) {
          console.log("[RevenueCat] ⏭️ Setup cancelled");
          return;
        }

        if (!alreadyConfigured) {
          console.log(
            `[RevenueCat] ⚙️ Configuring SDK with ${isDev ? "DEV" : "PROD"} key...`,
          );
          Purchases.configure({ apiKey: revenueCatApiKey });
          Purchases.setLogLevel(
            isDev ? Purchases.LOG_LEVEL.INFO : Purchases.LOG_LEVEL.WARN,
          ).catch((e) =>
            console.warn("[RevenueCat] Failed to set log level:", e),
          );

          const configured = await Purchases.isConfigured();
          console.log(`[RevenueCat] ✅ SDK configured: ${configured}`);
        }

        console.log("[RevenueCat] 👂 Adding customer info listener...");
        Purchases.addCustomerInfoUpdateListener((info) => {
          console.log("[RevenueCat] 🔔 CustomerInfo update received");
          updateFromCustomerInfo(info);
        });

        console.log("[RevenueCat] 👤 Getting current user...");
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) {
          console.log("[RevenueCat] ⏭️ Setup cancelled after getUser");
          return;
        }

        if (user?.id) {
          console.log(
            `[RevenueCat] 👤 User found: ${user.id.substring(0, 8)}...`,
          );
          const currentId = await Purchases.getAppUserID().catch(() => null);
          console.log(
            `[RevenueCat] 👤 Current RevenueCat user: ${currentId || "none"}`,
          );

          if (currentId !== user.id) {
            console.log("[RevenueCat] 🔐 Logging in user to RevenueCat...");
            await Purchases.logIn(user.id);
            console.log("[RevenueCat] ✅ User logged in");
          } else {
            console.log("[RevenueCat] ✅ User already logged in (same ID)");
          }
        } else {
          console.log("[RevenueCat] ⚠️ No user found");
        }

        console.log("[RevenueCat] 📥 Fetching initial customer info...");
        const info = await Purchases.getCustomerInfo();
        console.log(`[RevenueCat] 📥 Initial CustomerInfo:`, {
          entitlements: Object.keys(info.entitlements.active),
          hasPremium: info.entitlements.active[ENTITLEMENT_ID] != null,
        });

        if (!cancelled) {
          updateFromCustomerInfo(info);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[RevenueCat] ❌ Setup failed:", e);
          logger.warn("Subscription init failed", e);
        }
      } finally {
        if (!cancelled) {
          console.log("[RevenueCat] ✅ Setup complete");
          setIsLoading(false);
        }
      }
    };

    setup();

    console.log("[RevenueCat] 👂 Setting up auth state listener...");
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[RevenueCat] 🔐 Auth state changed: ${event}`);
      try {
        if (event === "SIGNED_IN" && session?.user?.id) {
          console.log(
            `[RevenueCat] 🔐 User signed in: ${session.user.id.substring(0, 8)}...`,
          );
          const currentId = await Purchases.getAppUserID().catch(() => null);
          if (currentId !== session.user.id) {
            console.log("[RevenueCat] 🔐 Logging in to RevenueCat...");
            await Purchases.logIn(session.user.id);
          }
          const info = await Purchases.getCustomerInfo();
          updateFromCustomerInfo(info);
        } else if (event === "SIGNED_OUT") {
          console.log(
            "[RevenueCat] 🔐 User signed out, logging out from RevenueCat...",
          );
          await Purchases.logOut();
          setIsPremium(false);
        }
      } catch (e) {
        console.error("[RevenueCat] ❌ Auth state change failed:", e);
        logger.warn("Subscription auth state change failed", e);
      }
    });

    return () => {
      console.log("[RevenueCat] 🧹 Cleaning up...");
      cancelled = true;
      subscription.unsubscribe();
      Purchases.removeCustomerInfoUpdateListener(updateFromCustomerInfo);
    };
  }, [updateFromCustomerInfo]);

  const showPaywall = useCallback(() => {
    console.log("[RevenueCat] 🎫 Showing paywall");
    setPaywallVisible(true);
  }, []);

  const hidePaywall = useCallback(() => {
    console.log("[RevenueCat] 🎫 Hiding paywall");
    setPaywallVisible(false);
  }, []);

  const value: SubscriptionContextValue = {
    isPremium,
    isLoading,
    refetch,
    applyCustomerInfo,
    showPaywall,
    hidePaywall,
    paywallVisible,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    console.warn("[RevenueCat] ⚠️ useSubscription called outside provider");
    return {
      isPremium: false,
      isLoading: false,
      refetch: async () => {},
      applyCustomerInfo: () => {},
      showPaywall: () => {},
      hidePaywall: () => {},
      paywallVisible: false,
    };
  }
  return ctx;
}
