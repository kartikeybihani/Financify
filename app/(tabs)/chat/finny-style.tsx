import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import IconButton from "@/src/components/shared/IconButton";

interface FinnyStyleScreenProps {
  onBack: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

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
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
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
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(20),
  },
  section: {
    marginBottom: responsivePadding(24),
  },
  sectionTitle: {
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
    color: "#fff",
    marginBottom: responsivePadding(12),
    letterSpacing: 0.3,
    marginLeft: 4,
  },
  styleOptionsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  styleOption: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: responsivePadding(18),
    paddingHorizontal: responsivePadding(16),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  styleOptionLast: {
    borderBottomWidth: 0,
  },
  styleOptionLeft: {
    flex: 1,
  },
  styleOptionTitle: {
    fontSize: responsiveFontSize(16),
    color: "#fff",
    fontWeight: "500" as const,
    marginBottom: 4,
  },
  styleOptionTitleSelected: {
    color: "#4A90E2",
  },
  styleOptionSubtitle: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: responsiveFontSize(18),
  },
  checkmarkContainer: {
    width: 24,
    height: 24,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#4A90E2",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkmarkSelected: {
    backgroundColor: "#4A90E2",
  },
  checkmarkIcon: {
    fontSize: 12,
    color: "#fff",
  },
};

interface StyleOptionProps {
  title: string;
  subtitle: string;
  isSelected: boolean;
  onPress: () => void;
  isLast?: boolean;
}

const StyleOption: React.FC<StyleOptionProps> = ({
  title,
  subtitle,
  isSelected,
  onPress,
  isLast = false,
}) => (
  <TouchableOpacity
    style={[styles.styleOption, isLast && styles.styleOptionLast]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.styleOptionLeft}>
      <Text
        style={[
          styles.styleOptionTitle,
          isSelected && styles.styleOptionTitleSelected,
        ]}
      >
        {title}
      </Text>
      <Text style={styles.styleOptionSubtitle}>{subtitle}</Text>
    </View>
    {isSelected && (
      <View style={styles.checkmarkContainer}>
        <View style={[styles.checkmark, styles.checkmarkSelected]}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      </View>
    )}
  </TouchableOpacity>
);

export default function FinnyStyleScreen({ onBack }: FinnyStyleScreenProps) {
  const insets = useSafeAreaInsets();
  const [selectedStyle, setSelectedStyle] = useState<
    "conversational" | "direct" | "witty"
  >("conversational");

  const styleOptions = [
    {
      id: "conversational" as const,
      title: "Conversational",
      subtitle: '"Let\'s chat about your finances like friends"',
    },
    {
      id: "direct" as const,
      title: "Direct",
      subtitle: '"Let\'s look at the numbers"',
    },
    {
      id: "witty" as const,
      title: "Witty",
      subtitle: '"Finance with a dash of humor"',
    },
  ];

  const handleStyleSelect = (style: "conversational" | "direct" | "witty") => {
    setSelectedStyle(style);
    // TODO: Save the selected style to user preferences
    console.log("Selected style:", style);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <View style={styles.header}>
          <IconButton icon="chevron-back" onPress={onBack} size={22} />
          <Text style={styles.headerTitle}>Finny's Style</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.section}>
            <View style={styles.styleOptionsContainer}>
              {styleOptions.map((option, index) => (
                <StyleOption
                  key={option.id}
                  title={option.title}
                  subtitle={option.subtitle}
                  isSelected={selectedStyle === option.id}
                  onPress={() => handleStyleSelect(option.id)}
                  isLast={index === styleOptions.length - 1}
                />
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
