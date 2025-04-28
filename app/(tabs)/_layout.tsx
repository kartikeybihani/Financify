import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
  TouchableOpacityProps,
} from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    {
      name: "index",
      label: "Home",
      icon: "home-outline",
    },
    {
      name: "finny",
      label: "Finny",
      icon: "apps",
      isCenter: true,
    },
    {
      name: "insights",
      label: "Insights",
      icon: "stats-chart-outline",
    },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
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
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: "#121212" }} />
        ),
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarShowLabel: !tab.isCenter,
            tabBarLabel: ({ focused }) => (
              <Text style={[styles.tabLabel, focused && styles.focusedLabel]}>
                {tab.label}
              </Text>
            ),
            tabBarIcon: ({ focused }) => (
              <View style={tab.isCenter ? styles.centerTab : undefined}>
                <Ionicons
                  name={tab.icon as any}
                  size={tab.isCenter ? 30 : 24}
                  color={focused ? "#4A90E2" : "#ccc"}
                />
              </View>
            ),
            tabBarButton: (props) => {
              const { style, ...otherProps } = props as TouchableOpacityProps;
              return (
                <TouchableOpacity
                  {...otherProps}
                  style={style}
                  activeOpacity={0.8}
                />
              );
            },
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
