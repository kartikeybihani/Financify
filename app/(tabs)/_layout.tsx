import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
  TouchableOpacityProps,
  Image,
  Animated,
} from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Easing } from "react-native";

const FinnyTabIcon = forwardRef(({ focused }: { focused: boolean }, ref) => {
  const rotation = useRef(new Animated.Value(0)).current;

  const animate = () => {
    rotation.setValue(0);
    Animated.timing(rotation, {
      toValue: 1,
      duration: 1200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  useImperativeHandle(ref, () => ({ animate }));

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.Image
      source={require("../assets/main1.png")}
      style={{
        width: 50,
        height: 50,
        tintColor: focused ? "#4A90E2" : "#ccc",
        transform: [{ rotate }],
      }}
      resizeMode="contain"
    />
  );
});

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();

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
      iconType: "image",
      icon: require("../assets/icon.png"),
      iconCategory: null,
    },
    {
      name: "timeline",
      label: "Goals",
      icon: "timeline-check-outline",
      iconCategory: "MaterialCommunityIcons",
    },
    {
      name: "insights",
      label: "Insights",
      icon: "stats-chart-outline",
      iconCategory: "Ionicons",
    },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true, // Set globally
        tabBarStyle: {
          height: 70,
          paddingVertical: 5,
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
            tabBarLabel: ({ focused }) => {
              return (
                <Text style={[styles.tabLabel, focused && styles.focusedLabel]}>
                  {tab.label}
                </Text>
              );
            },
            tabBarIcon: ({ focused }) => {
              if (tab.iconType === "image") {
                return (
                  <View>
                    <Image
                      source={tab.icon}
                      style={{
                        width: 26,
                        height: 26,
                        tintColor: focused ? "#4A90E2" : "#ccc",
                      }}
                    />
                  </View>
                );
              }
              const IconComponent =
                tab.iconCategory === "Ionicons"
                  ? Ionicons
                  : MaterialCommunityIcons;
              return (
                <View>
                  <IconComponent
                    name={tab.icon as any}
                    size={24}
                    color={focused ? "#4A90E2" : "#ccc"}
                  />
                </View>
              );
            },
            tabBarButton: (props) => {
              const { style, ...otherProps } = props as TouchableOpacityProps;
              return (
                <TouchableOpacity
                  {...otherProps}
                  style={style}
                  activeOpacity={0.8}
                  onPress={(e) => {
                    if (props.onPress) props.onPress(e);
                  }}
                />
              );
            },
          }}
          listeners={undefined}
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
