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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs, useRouter, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Easing } from "react-native";
import { BlurView } from "expo-blur";
import { NativeTabs } from "expo-router/unstable-native-tabs";

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
  const insets = useSafeAreaInsets();
  // Try to load NativeTabs at runtime to support iOS 26 glass when available
  let NativeTabsModule: any = null;
  let NativeTabsComp: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    NativeTabsModule = require("expo-router/unstable-native-tabs");
    NativeTabsComp = NativeTabsModule?.NativeTabs || null;
  } catch (e) {
    NativeTabsComp = null;
  }
  const tabs: TabMeta[] = [
    {
      name: "index",
      label: "Home",
      icon: "home-outline",
      iconCategory: "Ionicons",
    },
    {
      name: "chat",
      label: "Finny",
      icon: "home-outline",
      iconCategory: "Ionicons",
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

  if (NativeTabsComp) {
    const NativeTabs = NativeTabsComp;
    return (
      <NativeTabs
        initialRouteName="chat"
        screenOptions={{
          headerShown: false,
          tabBarBlurEffect: "systemUltraThinMaterial",
          tabBarActiveTintColor: "#4A90E2",
          tabBarLabelStyle: { fontSize: 13 },
        }}
      >
        {tabs.map((tab) => (
          <NativeTabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarIcon: ({
                focused,
                color,
              }: {
                focused: boolean;
                color: string;
              }) => {
                // Image icon path removed since all tabs now use vector icons
                const IconComponent =
                  tab.iconCategory === "Ionicons"
                    ? Ionicons
                    : MaterialCommunityIcons;
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
      </NativeTabs>
    );
  }

  // Fallback to custom glass tab bar when NativeTabs is unavailable
  return (
    <Tabs
      initialRouteName="chat"
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <GlassTabBar {...props} tabs={tabs} />}
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
              // Image icon path removed since all tabs now use vector icons
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

type TabMeta = {
  name: string;
  label: string;
  icon?: any;
  iconType?: "image";
  iconCategory?: "Ionicons" | "MaterialCommunityIcons" | null;
};

function GlassTabBar({
  state,
  descriptors,
  navigation,
  tabs,
}: any & { tabs: TabMeta[] }) {
  const insets = useSafeAreaInsets();
  const themeBlue = "#4A90E2";
  const animsRef = useRef<
    Record<
      string,
      {
        scale: Animated.Value;
        bgOpacity: Animated.Value;
        labelOpacity: Animated.Value;
      }
    >
  >({});

  // Initialize animated values for each route
  state.routes.forEach((route: any, index: number) => {
    if (!animsRef.current[route.key]) {
      animsRef.current[route.key] = {
        scale: new Animated.Value(state.index === index ? 1 : 0),
        bgOpacity: new Animated.Value(state.index === index ? 1 : 0),
        labelOpacity: new Animated.Value(state.index === index ? 1 : 0.7),
      };
    }
  });

  // Animate when active tab changes
  useEffect(() => {
    state.routes.forEach((route: any, index: number) => {
      const isFocused = state.index === index;
      const anims = animsRef.current[route.key];
      if (!anims) return;
      Animated.parallel([
        Animated.timing(anims.scale, {
          toValue: isFocused ? 1 : 0,
          duration: 220,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(anims.bgOpacity, {
          toValue: isFocused ? 1 : 0,
          duration: 240,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(anims.labelOpacity, {
          toValue: isFocused ? 1 : 0.7,
          duration: 220,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
      ]).start();
    });
  }, [state.index]);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
    >
      <View style={{ height: Math.max(insets.bottom, 16) }} />
      <View style={styles.glassWrapper}>
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={15}
            tint="light"
            style={styles.glassBackground}
          />
        ) : (
          <View
            style={[
              styles.glassBackground,
              { backgroundColor: "rgba(18,18,18,0.85)" },
            ]}
          />
        )}

        <View style={styles.tabRow}>
          {state.routes.map((route: any, index: number) => {
            const isFocused = state.index === index;
            const tabMeta = tabs.find((t: TabMeta) => t.name === route.name) as
              | TabMeta
              | undefined;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            const color = isFocused ? themeBlue : "#C7C7CC";

            let IconComponent: any = null;
            if (tabMeta?.iconType !== "image") {
              IconComponent =
                tabMeta?.iconCategory === "Ionicons"
                  ? Ionicons
                  : MaterialCommunityIcons;
            }

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={
                  descriptors[route.key]?.options?.tabBarAccessibilityLabel
                }
                testID={descriptors[route.key]?.options?.tabBarTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                activeOpacity={0.85}
                style={styles.tabButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Animated.View
                  style={[
                    styles.tabButtonInner,
                    {
                      transform: [
                        {
                          scale: (
                            animsRef.current[route.key]?.scale ||
                            new Animated.Value(1)
                          ).interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.98, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.focusedBg,
                      { opacity: animsRef.current[route.key]?.bgOpacity || 0 },
                    ]}
                  />
                  {tabMeta?.iconType === "image" && tabMeta.icon ? (
                    <Image
                      source={tabMeta.icon}
                      style={{ width: 24, height: 24, tintColor: color }}
                      resizeMode="contain"
                    />
                  ) : (
                    IconComponent && (
                      <IconComponent
                        name={tabMeta?.icon as any}
                        size={22}
                        color={color}
                      />
                    )
                  )}
                  <Animated.Text
                    style={[
                      styles.tabText,
                      {
                        color,
                        opacity: animsRef.current[route.key]?.labelOpacity || 1,
                      },
                    ]}
                  >
                    {tabMeta?.label ?? route.name}
                  </Animated.Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
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
  glassWrapper: {
    marginHorizontal: 17,
    marginBottom: 8,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,18,18,0.55)",
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 1,
    paddingVertical: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignSelf: "stretch",
    width: "100%",
  },
  focusedBg: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 6,
    right: 6,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 1,
    paddingVertical: 8,
    borderRadius: 15,
    gap: 1,
    minWidth: 64,
  },
  pillUnfocused: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pillFocused: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tabText: {
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.2,
  },
});
