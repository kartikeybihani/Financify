import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs, Label, Icon } from "expo-router/unstable-native-tabs";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome,
} from "@expo/vector-icons";

export default function TabLayout() {
  // Check if we should use NativeTabs (iOS 26+ only)
  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS ? parseInt(Platform.Version as string, 10) : 0;
  const shouldUseNativeTabs = isIOS && iosVersion >= 26;

  // Debug logging
  console.log(
    `Platform: ${Platform.OS}, iOS Version: ${iosVersion}, Should use NativeTabs: ${shouldUseNativeTabs}`
  );

  const tabs = [
    {
      name: "index",
      label: "Home",
      icon: "home-outline",
      iconCategory: "Ionicons",
    },
    {
      name: "chat",
      label: "Finny",
      icon: "fire",
      iconCategory: "FontAwesome",
    },
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

  if (shouldUseNativeTabs) {
    return (
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
    );
  }

  // Fallback to standard Tabs for iOS < 26 and other platforms
  // Note: expo-router handles lazy loading automatically via file-based routing
  // Setting initialRouteName to "index" ensures Home loads first
  // Moving providers to screens (ChatProvider) and using useFocusEffect achieves lazy loading
  return (
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
  );
}
