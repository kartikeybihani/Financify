import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
} from "react-native";
import { useRouter, usePathname, Slot } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    {
      name: "Home",
      icon: "home-outline",
      route: "/(tabs)",
    },
    {
      name: "Finny",
      icon: "apps",
      route: "/(tabs)/finny",
      isCenter: true,
    },
    {
      name: "Insights",
      icon: "stats-chart-outline",
      route: "/(tabs)/insights",
    },
  ];

  return (
    <View style={styles.wrapper}>
      <View style={styles.content}>
        <Slot />
        {/* This is where your tab screens like index.tsx will render */}
      </View>
      <View style={styles.tabBarContainer}>
        {tabs.map((tab, index) => {
          const isFocused = pathname === tab.route;
          return (
            <TouchableOpacity
              key={index}
              onPress={() => router.push(tab.route)}
              style={[styles.tabButton, tab.isCenter && styles.centerTab]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={tab.icon as any}
                size={tab.isCenter ? 30 : 24}
                color={isFocused ? "#4A90E2" : "#ccc"}
              />
              {!tab.isCenter && (
                <Text
                  style={[styles.tabLabel, isFocused && styles.focusedLabel]}
                >
                  {tab.name}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#121212",
  },
  content: {
    flex: 1,
  },
  tabBarContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: 70,
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
    backgroundColor: "#121212",
    borderTopWidth: 1,
    borderTopColor: "#222",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerTab: {
    backgroundColor: "#1f1f1f",
    borderRadius: 50,
    width: 64,
    height: 64,
    marginTop: -30,
    shadowColor: "#4A90E2",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  focusedLabel: {
    color: "#4A90E2",
    fontWeight: "600",
  },
});
