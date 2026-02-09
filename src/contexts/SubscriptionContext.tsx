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

// REVENUECAT DISABLED FOR DEV MODE
// const extra = Constants.expoConfig?.extra as Record<string, string | boolean | undefined>;
// const isDev = __DEV__;
// const testKey = extra?.revenuecatIosApiKeyTest as string | undefined;
// const prodKey = extra?.revenuecatIosApiKeyProd as string | undefined;
// const revenueCatApiKey =
//   Platform.OS === "ios"
//     ? testKey || prodKey
//     : null;

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
  // REVENUECAT DISABLED FOR DEV MODE - Always return premium
  const [isPremium, setIsPremium] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
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
    // REVENUECAT DISABLED FOR DEV MODE
    console.log("[RevenueCat] ⏭️ Refetch skipped (RevenueCat disabled)");
    setIsLoading(false);
    // try {
    //   const configured = await Purchases.isConfigured();
    //   if (!configured) {
    //     console.warn("[RevenueCat] ⚠️ Refetch: SDK not configured");
    //     return;
    //   }
    //   await Purchases.invalidateCustomerInfoCache();
    //   const info = await Purchases.getCustomerInfo();
    //   updateFromCustomerInfo(info);
    // } catch (e) {
    //   console.error("[RevenueCat] ❌ Refetch failed:", e);
    //   logger.warn("Subscription refetch failed", e);
    // } finally {
    //   setIsLoading(false);
    // }
  }, [updateFromCustomerInfo]);

  const applyCustomerInfo = useCallback(
    (info: CustomerInfo) => {
      console.log("[RevenueCat] ✅ Applying CustomerInfo immediately");
      updateFromCustomerInfo(info);
    },
    [updateFromCustomerInfo],
  );

  useEffect(() => {
    // REVENUECAT DISABLED FOR DEV MODE - Always premium
    console.log(
      "[RevenueCat] ⏭️ Setup skipped (RevenueCat disabled) - Premium enabled",
    );
    setIsPremium(true);
    setIsLoading(false);

    // if (!revenueCatApiKey || Platform.OS !== "ios") {
    //   console.log("[RevenueCat] ⏭️ Setup skipped (no key or not iOS)");
    //   setIsLoading(false);
    //   return;
    // }

    // console.log("[RevenueCat] 🚀 Starting setup...");
    // Purchases.setLogHandler((logLevel: LOG_LEVEL, message: string) => {
    //   const msg = `[RevenueCat] ${message}`;
    //   switch (logLevel) {
    //     case "ERROR":
    //       console.error(msg);
    //       break;
    //     case "WARN":
    //       console.warn(msg);
    //       break;
    //     case "INFO":
    //       console.info(msg);
    //       break;
    //     case "DEBUG":
    //     case "VERBOSE":
    //     default:
    //       console.debug(msg);
    //       break;
    //   }
    // });

    // let cancelled = false;
    // const setup = async () => {
    //   try {
    //     const alreadyConfigured = await Purchases.isConfigured();
    //     if (cancelled) return;

    //     if (!alreadyConfigured) {
    //       Purchases.configure({ apiKey: revenueCatApiKey });
    //       Purchases.setLogLevel(
    //         isDev ? Purchases.LOG_LEVEL.INFO : Purchases.LOG_LEVEL.WARN,
    //       ).catch((e) =>
    //         console.warn("[RevenueCat] Failed to set log level:", e),
    //       );
    //     }

    //     Purchases.addCustomerInfoUpdateListener((info) => {
    //       updateFromCustomerInfo(info);
    //     });

    //     const {
    //       data: { user },
    //     } = await supabase.auth.getUser();

    //     if (cancelled) return;

    //     if (user?.id) {
    //       const currentId = await Purchases.getAppUserID().catch(() => null);
    //       if (currentId !== user.id) {
    //         await Purchases.logIn(user.id);
    //       }
    //     }

    //     const info = await Purchases.getCustomerInfo();
    //     if (!cancelled) {
    //       updateFromCustomerInfo(info);
    //     }
    //   } catch (e) {
    //     if (!cancelled) {
    //       console.error("[RevenueCat] ❌ Setup failed:", e);
    //       logger.warn("Subscription init failed", e);
    //     }
    //   } finally {
    //     if (!cancelled) {
    //       setIsLoading(false);
    //     }
    //   }
    // };

    // setup();

    // const {
    //   data: { subscription },
    // } = supabase.auth.onAuthStateChange(async (event, session) => {
    //   try {
    //     if (event === "SIGNED_IN" && session?.user?.id) {
    //       const currentId = await Purchases.getAppUserID().catch(() => null);
    //       if (currentId !== session.user.id) {
    //         await Purchases.logIn(session.user.id);
    //       }
    //       const info = await Purchases.getCustomerInfo();
    //       updateFromCustomerInfo(info);
    //     } else if (event === "SIGNED_OUT") {
    //       await Purchases.logOut();
    //       setIsPremium(false);
    //     }
    //   } catch (e) {
    //     console.error("[RevenueCat] ❌ Auth state change failed:", e);
    //     logger.warn("Subscription auth state change failed", e);
    //   }
    // });

    // return () => {
    //   cancelled = true;
    //   subscription.unsubscribe();
    //   Purchases.removeCustomerInfoUpdateListener(updateFromCustomerInfo);
    // };
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
    // REVENUECAT DISABLED FOR DEV MODE - Always return premium
    return {
      isPremium: true,
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
