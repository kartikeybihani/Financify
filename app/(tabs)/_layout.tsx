import React, { useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs, Label, Icon } from "expo-router/unstable-native-tabs";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome,
} from "@expo/vector-icons";
import logger from "@/src/utils/core/logger";
import { supabase } from "@/src/lib/supabase/supabase";
import { notificationService } from "@/src/utils/core/notificationService";
import AppStorage from "@/src/utils/storage/storage";
import NotificationPermissionModal from "@/src/components/modals/NotificationPermissionModal";
import { useSubscription } from "@/src/contexts/SubscriptionContext";

const NOTIFICATION_PROMPT_DISMISSED_AT_KEY = "notification_prompt_dismissed_at";
const REPROMPT_AFTER_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const PROMPT_DELAY_MS = 1500;
const PAYWALL_AFTER_NOTIFICATION_DELAY_MS = 2500;

export default function TabLayout() {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const hasCheckedRef = useRef(false);
  const hasScheduledPaywallRef = useRef(false);
  const paywallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showPaywall, isPremium } = useSubscription();
  const isPremiumRef = React.useRef(isPremium);
  isPremiumRef.current = isPremium;

  const schedulePostNotificationPaywall = useCallback(() => {
    if (hasScheduledPaywallRef.current) return;
    hasScheduledPaywallRef.current = true;
    paywallTimerRef.current = setTimeout(() => {
      paywallTimerRef.current = null;
      if (!isPremiumRef.current) showPaywall();
    }, PAYWALL_AFTER_NOTIFICATION_DELAY_MS);
  }, [showPaywall]);

  useEffect(
    () => () => {
      if (paywallTimerRef.current) clearTimeout(paywallTimerRef.current);
    },
    []
  );

  // Show notification permission modal when: onboarding completed, no active push token for this device, and (never dismissed or dismissed > 2 days ago)
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .single();
        if (!profile?.onboarding_completed) return;

        const deviceId = notificationService.getDeviceId();
        const { data: existingToken } = await supabase
          .from("user_push_tokens")
          .select("id")
          .eq("user_id", user.id)
          .eq("device_id", deviceId)
          .eq("is_active", true)
          .maybeSingle();

        if (existingToken) {
          schedulePostNotificationPaywall();
          return;
        }

        const dismissedAtRaw = AppStorage.getItemSync(
          NOTIFICATION_PROMPT_DISMISSED_AT_KEY
        );
        if (dismissedAtRaw) {
          const dismissedAt = new Date(dismissedAtRaw).getTime();
          if (Date.now() - dismissedAt < REPROMPT_AFTER_MS) {
            schedulePostNotificationPaywall();
            return;
          }
        }

        setShowNotificationModal(true);
      } catch (e) {
        logger.error("Notification prompt check failed", e);
        schedulePostNotificationPaywall();
      }
    }, PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [schedulePostNotificationPaywall]);

  const handleNotificationAllow = async () => {
    try {
      const granted = await notificationService.requestPermissions();
      if (granted) logger.info("Notification permissions granted (tabs)");
    } catch (e) {
      logger.error("Notification allow failed", e);
    }
    setShowNotificationModal(false);
    schedulePostNotificationPaywall();
  };

  const handleNotificationDontAllow = () => {
    AppStorage.setItemSync(
      NOTIFICATION_PROMPT_DISMISSED_AT_KEY,
      new Date().toISOString()
    );
    setShowNotificationModal(false);
    schedulePostNotificationPaywall();
  };

  // Check if we should use NativeTabs (iOS 26+ only)
  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS ? parseInt(Platform.Version as string, 10) : 0;
  const shouldUseNativeTabs = isIOS && iosVersion >= 26;

  logger.debug(
    `Platform: ${Platform.OS}, iOS Version: ${iosVersion}, Should use NativeTabs: ${shouldUseNativeTabs}`
  );

  const tabs = [
    {
      name: "index",
      label: "Home",
      icon: "home-outline",
      iconCategory: "Ionicons",
    },
    { name: "chat", label: "Finny", icon: "fire", iconCategory: "FontAwesome" },
    {
      name: "goals",
      label: "Goals",
      icon: "target",
      iconCategory: "MaterialCommunityIcons",
    },
    {
      name: "insights",
      label: "Insights",
      icon: "stats-chart-outline",
      iconCategory: "Ionicons",
    },
  ];

  const modal = (
    <NotificationPermissionModal
      visible={showNotificationModal}
      onAllow={handleNotificationAllow}
      onDontAllow={handleNotificationDontAllow}
    />
  );

  if (shouldUseNativeTabs) {
    return (
      <>
        <NativeTabs minimizeBehavior="onScrollDown">
          <NativeTabs.Trigger name="index">
            <Label>Home</Label>
            <Icon sf={{ default: "house", selected: "house.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="chat">
            <Label>Finny</Label>
            <Icon sf={{ default: "flame", selected: "flame.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="goals">
            <Label>Goals</Label>
            <Icon sf={{ default: "target", selected: "target" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="insights">
            <Label>Insights</Label>
            <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
          </NativeTabs.Trigger>
        </NativeTabs>
        {modal}
      </>
    );
  }

  return (
    <>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#4A90E2",
          tabBarLabelStyle: { fontSize: 13 },
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarIcon: ({ focused, color }) => {
                const IconComponent =
                  tab.iconCategory === "Ionicons"
                    ? Ionicons
                    : tab.iconCategory === "MaterialCommunityIcons"
                    ? MaterialCommunityIcons
                    : FontAwesome;
                return (
                  <IconComponent
                    name={tab.icon as any}
                    size={22}
                    color={focused ? "#4A90E2" : "#C7C7CC"}
                  />
                );
              },
            }}
          />
        ))}
      </Tabs>
      {modal}
    </>
  );
}
