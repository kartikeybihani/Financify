import React from "react";
import { View, Text, Platform, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import IconButton from "@/src/components/shared/IconButton";

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
    paddingTop: Platform.OS === "ios" ? 7 : 11,
    paddingBottom: 9,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  headerTitle: {
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
    color: "#fff",
    letterSpacing: 0.1,
    flex: 1,
    textAlign: "center" as const,
  },
  spacer: {
    width: 34,
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
      <IconButton icon="chevron-back" onPress={handleBack} size={19} />
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}
