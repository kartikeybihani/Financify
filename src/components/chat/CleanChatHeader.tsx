import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDemoMode } from "@/src/contexts/DemoContext";

export default function CleanChatHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDemoMode } = useDemoMode();

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
        styles.container,
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
        <View style={styles.brandContainer}>
          <View style={styles.mascotContainer}>
            <Image
              source={require("../../../assets/images/mascot1.jpg")}
              style={styles.mascotImage}
            />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Finny</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push("/(tabs)/chat/finny-settings")}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="settings" size={17} color="#F3F8FF" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 4,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 38,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    paddingRight: 6,
  },
  mascotContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    // backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: 1.5,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.24)",
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  mascotImage: {
    width: "100%",
    height: "100%",
    borderRadius: 14.5,
    transform: [{ scaleX: -1 }],
  },
  headerTextContainer: {
    justifyContent: "center",
    marginLeft: 7,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.2,
  },
  settingsButton: {
    width: 35,
    height: 35,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 44, 78, 0.38)",
    borderWidth: 1,
    borderColor: "rgba(143, 187, 255, 0.26)",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
});
