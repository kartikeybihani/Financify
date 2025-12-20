import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

interface ChatScreenHeaderProps {
  title: string;
  onBack?: () => void;
}

const { width: screenWidth } = Dimensions.get("window");

// Responsive calculations
const isSmallScreen = screenWidth < 375;
const isLargeScreen = screenWidth >= 414;

const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.9;
  if (isLargeScreen) return baseSize * 1.1;
  return baseSize;
};

const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

const styles = {
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: responsivePadding(16),
    paddingTop: Platform.OS === "ios" ? 8 : 12,
    paddingBottom: 10,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 30, 30, 0.8)",
  },
  headerTitle: {
    fontSize: responsiveFontSize(18),
    fontWeight: "600" as const,
    color: "#fff",
    letterSpacing: 0.5,
    flex: 1,
    textAlign: "center" as const,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  spacer: {
    width: 40,
  },
};

export default function ChatScreenHeader({
  title,
  onBack,
}: ChatScreenHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleBack}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={["rgba(255, 255, 255, 0.15)", "rgba(255, 255, 255, 0.05)"]}
          style={styles.closeButtonCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}
