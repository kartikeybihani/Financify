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

// Explicitly check what keys are available
const testKey = extra?.revenuecatIosApiKeyTest;
const prodKey = extra?.revenuecatIosApiKeyProd;

console.log("[RevenueCat] Environment check:", {
  hasTestKey: !!testKey,
  hasProdKey: !!prodKey,
  testKeyPrefix: testKey?.substring(0, 20),
  prodKeyPrefix: prodKey?.substring(0, 20),
  isDev,
  platform: Platform.OS,
});

const revenueCatApiKey =
  Platform.OS === "ios"
    ? prodKey || testKey // Use prod if available, fallback to test
    : null;

if (Platform.OS === "ios") {
  if (!revenueCatApiKey) {
    console.error("[RevenueCat] ❌ NO API KEY FOUND! Check your .env file");
  } else {
    const keyType = revenueCatApiKey.toLowerCase().includes("test") ? "TEST" : "PROD";
    console.log(`[RevenueCat] ✅ Using ${keyType} key: ${revenueCatApiKey.substring(0, 20)}...`);
  }
}

export interface SubscriptionContextValue {
  isPremium: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
  /** Apply CustomerInfo immediately (e.g. from purchase/restore result). Use this so UI updates without waiting for cache. */
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

  const refetch = useCallback(async () => {
    if (!revenueCatApiKey || Platform.OS !== "ios") {
      setIsLoading(false);
      return;
    }
    try {
      const configured = await Purchases.isConfigured();
      if (!configured) return;
      await Purchases.invalidateCustomerInfoCache();
      const info = await Purchases.getCustomerInfo();
      const active = info.entitlements.active[ENTITLEMENT_ID] != null;
      setIsPremium(active);
    } catch (e) {
      logger.warn("Subscription refetch failed", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyCustomerInfo = useCallback((info: CustomerInfo) => {
    const active = info?.entitlements?.active?.[ENTITLEMENT_ID] != null;
    setIsPremium(active);
  }, []);

  const updateFromCustomerInfo = useCallback((info: CustomerInfo | null) => {
    if (!info) {
      setIsPremium(false);
      return;
    }
    const active = info.entitlements.active[ENTITLEMENT_ID] != null;
    setIsPremium(active);
  }, []);

  useEffect(() => {
    if (!revenueCatApiKey || Platform.OS !== "ios") {
      setIsLoading(false);
      return;
    }

    // Avoid React Native redbox from RevenueCat's default console.error logging.
    Purchases.setLogHandler((logLevel: LOG_LEVEL, message: string) => {
      const msg = `[RevenueCat] ${message}`;
      switch (logLevel) {
        case "ERROR":
          logger.warn(msg);
          break;
        case "WARN":
          logger.warn(msg);
          break;
        case "INFO":
          logger.info(msg);
          break;
        case "DEBUG":
        case "VERBOSE":
        default:
          logger.debug(msg);
          break;
      }
    });

    let cancelled = false;
    const setup = async () => {
      try {
        const alreadyConfigured = await Purchases.isConfigured();
        if (cancelled) return;
        // Only configure once per app process (avoids "Purchases instance already set" on Strict Mode remount)
        if (!alreadyConfigured) {
          console.log("[RevenueCat] About to configure:", {
            hasKey: !!revenueCatApiKey,
            keyPrefix: revenueCatApiKey?.substring(0, 20),
            isDev,
            alreadyConfigured,
          });
          logger.info(
            `[RevenueCat] Configuring with key: ${revenueCatApiKey?.substring(0, 20)}... (${isDev ? "DEV" : "PROD"} mode)`,
          );
          Purchases.configure({ apiKey: revenueCatApiKey });
          Purchases.setLogLevel(
            __DEV__ ? Purchases.LOG_LEVEL.INFO : Purchases.LOG_LEVEL.WARN,
          ).catch(() => {});

          // Verify configuration
          const configured = await Purchases.isConfigured();
          logger.info(`[RevenueCat] Configuration status: ${configured}`);

          // Check if Test Store is being used (test keys usually have "test" in them)
          const isTestStore = revenueCatApiKey?.toLowerCase().includes("test");
          logger.info(`[RevenueCat] Is Test Store: ${isTestStore}`);
        }
        Purchases.addCustomerInfoUpdateListener(updateFromCustomerInfo);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        // Only logIn when we have a user and SDK might not have them (avoids "same appUserID" warning on every launch)
        if (user?.id) {
          const currentId = await Purchases.getAppUserID().catch(() => null);
          if (currentId !== user.id) await Purchases.logIn(user.id);
        }
        const info = await Purchases.getCustomerInfo();
        if (!cancelled) updateFromCustomerInfo(info);
      } catch (e) {
        if (!cancelled) logger.warn("Subscription init failed", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    setup();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_IN" && session?.user?.id) {
          const currentId = await Purchases.getAppUserID().catch(() => null);
          if (currentId !== session.user.id)
            await Purchases.logIn(session.user.id);
          const info = await Purchases.getCustomerInfo();
          updateFromCustomerInfo(info);
        } else if (event === "SIGNED_OUT") {
          await Purchases.logOut();
          setIsPremium(false);
        }
      } catch (e) {
        logger.warn("Subscription auth state change failed", e);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      Purchases.removeCustomerInfoUpdateListener(updateFromCustomerInfo);
    };
  }, [updateFromCustomerInfo]);

  const showPaywall = useCallback(() => setPaywallVisible(true), []);
  const hidePaywall = useCallback(() => setPaywallVisible(false), []);

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
