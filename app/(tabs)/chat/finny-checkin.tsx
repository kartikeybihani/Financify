import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { notificationService } from "@/src/utils/core/notificationService";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import ChatScreenHeader from "@/src/components/shared/ChatScreenHeader";

interface FinnyCheckinScreenProps {
  onBack?: () => void;
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
  disabled?: boolean;
}

const FrequencyOption: React.FC<FrequencyOptionProps> = ({
  title,
  isSelected,
  onPress,
  isLast = false,
  disabled = false,
}) => (
  <TouchableOpacity
    style={[styles.frequencyOption, isLast && styles.frequencyOptionLast]}
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
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
  const [isSaving, setIsSaving] = useState(false);


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

  // Load current frequency from database on mount
  useEffect(() => {
    const loadCheckinFrequency = async () => {
      let frequency: "daily" | "3times" | "weekly" | "never" = "daily";

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          logger.warn("[FinnyCheckin] No authenticated user found");
        } else {
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("checkin_frequency")
            .eq("id", user.id)
            .maybeSingle();

          if (error) {
            logger.error("[FinnyCheckin] Error loading frequency:", error);
          } else if (profile?.checkin_frequency) {
            frequency = profile.checkin_frequency as
              | "daily"
              | "3times"
              | "weekly"
              | "never";
          }
        }
      } catch (error) {
        logger.error("[FinnyCheckin] Error loading frequency:", error);
      } finally {
        // Always set the frequency (defaults to daily)
        setSelectedFrequency(frequency);
      }
    };

    loadCheckinFrequency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFrequencySelect = async (
    frequency: "daily" | "3times" | "weekly" | "never"
  ) => {
    // Don't update if already selected
    if (selectedFrequency === frequency) return;

    // Optimistically update UI
    setSelectedFrequency(frequency);

    try {
      setIsSaving(true);

      // Save to database first
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const { error: dbError } = await supabase
        .from("profiles")
        .update({ checkin_frequency: frequency })
        .eq("id", user.id);

      if (dbError) {
        throw dbError;
      }

      logger.info("[FinnyCheckin] Frequency saved successfully:", frequency);

      // Request notification permissions if not already granted (only if not "never")
      if (frequency !== "never") {
        const hasPermission = await notificationService.requestPermissions();
        if (!hasPermission) {
          // Preference is still saved to database, user can enable notifications later
          return;
        }
      }

      // Save preferences and schedule notifications
      const preferences = {
        frequency,
        enabled: frequency !== "never",
      };

      await notificationService.savePreferences(preferences);
      await notificationService.scheduleNotifications(preferences);

      logger.info(
        "[FinnyCheckin] Frequency and notifications updated:",
        frequency
      );
    } catch (error: any) {
      logger.error("[FinnyCheckin] Error saving frequency:", error);
      // Revert to previous frequency on error
      Alert.alert(
        "Error",
        "Failed to save check-in frequency. Please try again.",
        [{ text: "OK" }]
      );
      // Reload from database to get the correct value
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("checkin_frequency")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.checkin_frequency) {
          setSelectedFrequency(
            profile.checkin_frequency as "daily" | "3times" | "weekly" | "never"
          );
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <ChatScreenHeader title="Check-in Frequency" onBack={onBack} />

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
                  disabled={isSaving}
                />
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
