import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDemoMode } from "@/src/contexts/DemoContext";

interface CleanInvestmentsHeaderProps {
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function CleanInvestmentsHeader({
  isRefreshing,
  onRefresh,
}: CleanInvestmentsHeaderProps) {
  const insets = useSafeAreaInsets();
  const { isDemoMode } = useDemoMode();
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isRefreshing) {
      const rotation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      );
      rotation.start();
      return () => rotation.stop();
    }

    Animated.timing(rotateAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isRefreshing, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <LinearGradient
      colors={
        [
          "rgba(74, 145, 226, 0.45)",
          "rgba(53, 120, 255, 0.26)",
          "transparent",
        ] as const
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.gradientContainer,
        {
          paddingTop: isDemoMode
            ? Platform.OS === "ios"
              ? 8
              : 12
            : insets.top + (Platform.OS === "ios" ? 0 : 8),
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.leftIconContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="trending-up" size={22} color="#4A90E2" />
          </View>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Investments</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.refreshButton,
            isRefreshing && styles.refreshButtonActive,
          ]}
          onPress={onRefresh}
          disabled={isRefreshing}
          activeOpacity={0.7}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <MaterialIcons
              name={isRefreshing ? "hourglass-empty" : "sync"}
              size={18}
              color="#4A90E2"
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    paddingBottom: 4,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 6,
    minHeight: 40,
    position: "relative",
  },
  leftIconContainer: {
    position: "absolute",
    left: 20,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20, 20, 25, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  titleContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.3,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20, 20, 25, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    position: "absolute",
    right: 20,
    top: "50%",
    marginTop: -18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  refreshButtonActive: {
    opacity: 0.7,
    borderColor: "rgba(74, 144, 226, 0.5)",
  },
});
