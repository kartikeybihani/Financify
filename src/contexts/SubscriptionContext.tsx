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

const log = logger.scope("RevenueCat");
if (__DEV__) log.setLevel("debug");

const REVENUECAT_DISABLED = false; // Set to false to enable RevenueCat SDK

const extra = Constants.expoConfig?.extra as Record<
  string,
  string | boolean | undefined
>;
const isDev = __DEV__;
const testKey = extra?.revenuecatIosApiKeyTest as string | undefined;
const prodKey = extra?.revenuecatIosApiKeyProd as string | undefined;
const revenueCatApiKey =
  !REVENUECAT_DISABLED && Platform.OS === "ios" ? prodKey || testKey : null;

export type PaywallCloseReason = "convert" | "dismiss";

export interface SubscriptionContextValue {
  isPremium: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
  applyCustomerInfo: (info: CustomerInfo) => void;
  /** Show paywall. onConvert runs only when user subscribes/starts trial; onDismiss runs on any close (legacy). For compulsory trial, pass onConvert only. */
  showPaywall: (opts?: {
    onConvert?: () => void;
    onDismiss?: () => void;
  }) => void;
  hidePaywall: (reason?: PaywallCloseReason) => void;
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
  const [isPremium, setIsPremium] = useState(REVENUECAT_DISABLED);
  const [isLoading, setIsLoading] = useState(!REVENUECAT_DISABLED);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const onPaywallConvertRef = React.useRef<(() => void) | null>(null);
  const onPaywallDismissRef = React.useRef<(() => void) | null>(null);
  const currentUserIdRef = React.useRef<string | null>(null);

  const updateFromCustomerInfo = useCallback((info: CustomerInfo | null) => {
    // Grandfathered users (uncomment GRANDFATHERED_USER_IDS in subscription.ts + add import):
    // const uid = currentUserIdRef.current;
    // if (uid && GRANDFATHERED_USER_IDS.has(uid)) {
    //   log.info("Grandfathered user → isPremium = true");
    //   setIsPremium(true);
    //   return;
    // }
    if (!info) {
      log.info("CustomerInfo: null → isPremium = false");
      setIsPremium(false);
      return;
    }
    const active = info.entitlements.active[ENTITLEMENT_ID] != null;
    log.info(
      `CustomerInfo: entitlement "${ENTITLEMENT_ID}" = ${active ? "ACTIVE" : "INACTIVE"}`,
    );
    setIsPremium(active);
  }, []);

  const refetch = useCallback(async () => {
    if (REVENUECAT_DISABLED) {
      log.info("Refetch skipped (RevenueCat disabled)");
      setIsLoading(false);
      return;
    }
    log.info("Refetch called");
    setIsLoading(true);
    try {
      const configured = await Purchases.isConfigured();
      if (!configured) {
        log.warn("Refetch: SDK not configured");
        setIsLoading(false);
        return;
      }
      await Purchases.invalidateCustomerInfoCache();
      const info = await Purchases.getCustomerInfo();
      log.info("Refetch: got CustomerInfo");
      updateFromCustomerInfo(info);
    } catch (e) {
      log.error("Refetch failed", e);
      logger.warn("Subscription refetch failed", e);
    } finally {
      setIsLoading(false);
    }
  }, [updateFromCustomerInfo]);

  const applyCustomerInfo = useCallback(
    (info: CustomerInfo) => {
      log.info("Applying CustomerInfo immediately");
      updateFromCustomerInfo(info);
    },
    [updateFromCustomerInfo],
  );

  useEffect(() => {
    if (REVENUECAT_DISABLED) {
      log.info("Setup skipped (RevenueCat disabled) - Premium enabled");
      setIsPremium(true);
      setIsLoading(false);
      return;
    }
    if (!revenueCatApiKey || Platform.OS !== "ios") {
      log.info("Setup skipped (no API key or not iOS)");
      setIsLoading(false);
      return;
    }

    log.info(
      "Starting setup...",
      prodKey ? "(App Store / production key)" : "(Test Store key)",
    );
    Purchases.setLogHandler((logLevel: LOG_LEVEL, message: string) => {
      const msg = `SDK: ${message}`;
      switch (logLevel) {
        case "ERROR":
          log.error(msg);
          break;
        case "WARN":
          log.warn(msg);
          break;
        case "INFO":
          log.info(msg);
          break;
        case "DEBUG":
        case "VERBOSE":
        default:
          log.debug(msg);
          break;
      }
    });

    let cancelled = false;
    const setup = async () => {
      try {
        const alreadyConfigured = await Purchases.isConfigured();
        if (cancelled) return;
        log.info("Purchases.isConfigured:", alreadyConfigured);

        if (!alreadyConfigured) {
          Purchases.configure({ apiKey: revenueCatApiKey });
          log.info("Purchases.configured with API key");
          Purchases.setLogLevel(
            isDev ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN,
          ).catch((e) => log.warn("Failed to set log level", e));
        }

        Purchases.addCustomerInfoUpdateListener((info) => {
          log.info("CustomerInfoUpdateListener fired");
          updateFromCustomerInfo(info);
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (user?.id) {
          currentUserIdRef.current = user.id;
          const currentId = await Purchases.getAppUserID().catch(() => null);
          log.info("App user ID", { current: currentId, supabase: user.id });
          if (currentId !== user.id) {
            await Purchases.logIn(user.id);
            log.info("Purchases.logIn completed");
          }
        } else {
          currentUserIdRef.current = null;
          log.info("No Supabase user, using anonymous RevenueCat user");
        }

        const info = await Purchases.getCustomerInfo();
        log.info("Initial getCustomerInfo completed");
        if (!cancelled) {
          updateFromCustomerInfo(info);
        }
      } catch (e) {
        if (!cancelled) {
          log.error("Setup failed", e);
          logger.warn("Subscription init failed", e);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    setup();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        log.info("Auth state change", {
          event,
          hasSession: !!session?.user?.id,
        });
        if (event === "SIGNED_IN" && session?.user?.id) {
          currentUserIdRef.current = session.user.id;
          const currentId = await Purchases.getAppUserID().catch(() => null);
          if (currentId !== session.user.id) {
            await Purchases.logIn(session.user.id);
            log.info("Purchases.logIn after sign-in");
          }
          const info = await Purchases.getCustomerInfo();
          updateFromCustomerInfo(info);
        } else if (event === "SIGNED_OUT") {
          currentUserIdRef.current = null;
          await Purchases.logOut();
          log.info("Purchases.logOut after sign-out");
          setIsPremium(false);
        }
      } catch (e) {
        log.error("Auth state change failed", e);
        logger.warn("Subscription auth state change failed", e);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      Purchases.removeCustomerInfoUpdateListener(updateFromCustomerInfo);
      log.info("Setup cleanup: listener removed");
    };
  }, [updateFromCustomerInfo]);

  const showPaywall = useCallback(
    (opts?: { onConvert?: () => void; onDismiss?: () => void }) => {
      log.info("Showing paywall");
      const onConvert =
        typeof opts?.onConvert === "function" ? opts.onConvert : null;
      const onDismiss =
        typeof opts?.onDismiss === "function" ? opts.onDismiss : null;
      onPaywallConvertRef.current = onConvert;
      onPaywallDismissRef.current = onDismiss;
      setPaywallVisible(true);
    },
    [],
  );

  const hidePaywall = useCallback((reason?: PaywallCloseReason) => {
    log.info("Hiding paywall", { reason });
    setPaywallVisible(false);
    const convertCb = onPaywallConvertRef.current;
    const dismissCb = onPaywallDismissRef.current;
    onPaywallConvertRef.current = null;
    onPaywallDismissRef.current = null;
    if (reason === "convert" && typeof convertCb === "function") {
      convertCb();
    } else if (typeof dismissCb === "function") {
      dismissCb();
    }
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
    log.warn("useSubscription called outside provider");
    return {
      isPremium: REVENUECAT_DISABLED,
      isLoading: false,
      refetch: async () => {},
      applyCustomerInfo: () => {},
      showPaywall: (_opts?: {
        onConvert?: () => void;
        onDismiss?: () => void;
      }) => {},
      hidePaywall: () => {},
      paywallVisible: false,
    };
  }
  return ctx;
}
