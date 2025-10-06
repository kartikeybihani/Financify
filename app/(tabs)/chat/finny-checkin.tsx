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
import { LinearGradient } from "expo-linear-gradient";

interface FinnyCheckinScreenProps {
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
    paddingTop:
      Platform.OS === "ios" ? responsivePadding(14) : responsivePadding(18),
    paddingBottom: responsivePadding(12),
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
  backButton: {
    padding: 6,
  },
  backButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(20),
  },
  section: {
    marginBottom: responsivePadding(24),
  },
  frequencyOptionsContainer: {
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
  frequencyOption: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: responsivePadding(16),
    paddingHorizontal: responsivePadding(16),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  frequencyOptionLast: {
    borderBottomWidth: 0,
  },
  frequencyOptionLeft: {
    flex: 1,
  },
  frequencyOptionTitle: {
    fontSize: responsiveFontSize(16),
    color: "#fff",
    fontWeight: "500" as const,
    marginBottom: 4,
  },
  frequencyOptionTitleSelected: {
    color: "#4A90E2",
  },
  frequencyOptionSubtitle: {
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

interface FrequencyOptionProps {
  title: string;
  isSelected: boolean;
  onPress: () => void;
  isLast?: boolean;
}

const FrequencyOption: React.FC<FrequencyOptionProps> = ({
  title,
  isSelected,
  onPress,
  isLast = false,
}) => (
  <TouchableOpacity
    style={[styles.frequencyOption, isLast && styles.frequencyOptionLast]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.frequencyOptionLeft}>
      <Text
        style={[
          styles.frequencyOptionTitle,
          isSelected && styles.frequencyOptionTitleSelected,
        ]}
      >
        {title}
      </Text>
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

export default function FinnyCheckinScreen({
  onBack,
}: FinnyCheckinScreenProps) {
  const insets = useSafeAreaInsets();
  const [selectedFrequency, setSelectedFrequency] = useState<
    "daily" | "3times" | "weekly" | "never"
  >("daily");

  const frequencyOptions = [
    {
      id: "daily" as const,
      title: "Daily",
    },
    {
      id: "3times" as const,
      title: "3 Times a Week",
    },
    {
      id: "weekly" as const,
      title: "Weekly",
    },
    {
      id: "never" as const,
      title: "Never",
    },
  ];

  const handleFrequencySelect = (
    frequency: "daily" | "3times" | "weekly" | "never"
  ) => {
    setSelectedFrequency(frequency);
    // TODO: Save the selected frequency to user preferences
    console.log("Selected frequency:", frequency);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={[
                "rgba(255, 255, 255, 0.15)",
                "rgba(255, 255, 255, 0.05)",
              ]}
              style={styles.backButtonCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Check-in Frequency</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.section}>
            <View style={styles.frequencyOptionsContainer}>
              {frequencyOptions.map((option, index) => (
                <FrequencyOption
                  key={option.id}
                  title={option.title}
                  isSelected={selectedFrequency === option.id}
                  onPress={() => handleFrequencySelect(option.id)}
                  isLast={index === frequencyOptions.length - 1}
                />
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
