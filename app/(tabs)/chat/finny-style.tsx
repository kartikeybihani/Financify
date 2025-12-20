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
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import ChatScreenHeader from "@/src/components/shared/ChatScreenHeader";
import { authenticatedFetch } from "@/src/utils/auth/authToken";

interface FinnyStyleScreenProps {
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
  disabled?: boolean;
}

const StyleOption: React.FC<StyleOptionProps> = ({
  title,
  subtitle,
  isSelected,
  onPress,
  isLast = false,
  disabled = false,
}) => (
  <TouchableOpacity
    style={[styles.styleOption, isLast && styles.styleOptionLast]}
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
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
  const [isSaving, setIsSaving] = useState(false);


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

  // Load current style from database on mount
  useEffect(() => {
    const loadFinnyStyle = async () => {
      let style: "conversational" | "direct" | "witty" = "conversational";

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          logger.warn("[FinnyStyle] No authenticated user found");
        } else {
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("finny_style")
            .eq("id", user.id)
            .maybeSingle();

          if (error) {
            logger.error("[FinnyStyle] Error loading style:", error);
          } else if (profile?.finny_style) {
            style = profile.finny_style as
              | "conversational"
              | "direct"
              | "witty";
          }
        }
      } catch (error) {
        logger.error("[FinnyStyle] Error loading style:", error);
      } finally {
        // Always set the style (defaults to conversational)
        setSelectedStyle(style);
      }
    };

    loadFinnyStyle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStyleSelect = async (
    style: "conversational" | "direct" | "witty"
  ) => {
    // Don't update if already selected
    if (selectedStyle === style) return;

    // Optimistically update UI
    setSelectedStyle(style);

    // Save to database
    try {
      setIsSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const { error } = await supabase
        .from("profiles")
        .update({ finny_style: style })
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      logger.info("[FinnyStyle] Style saved successfully:", style);

      // Invalidate profile cache on server
      try {
        const BASE_URL =
          process.env.EXPO_PUBLIC_APP_BASE_URL ||
          "https://financify-rose.vercel.app";

        const cacheResponse = await authenticatedFetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "invalidate_profile_cache",
          }),
        });
        
        if (cacheResponse.ok) {
          logger.info("[FinnyStyle] Profile cache invalidated successfully");
        } else {
          const errorText = await cacheResponse.text();
          logger.warn(
            `[FinnyStyle] Profile cache invalidation returned non-OK status: ${cacheResponse.status}`,
            errorText
          );
          Alert.alert(
            "Warning",
            "Failed to update Finny's style immediately. The change will take effect on your next message.",
            [{ text: "OK" }]
          );
        }
      } catch (cacheError: any) {
        logger.warn("[FinnyStyle] Failed to invalidate cache:", cacheError);
        Alert.alert(
          "Warning",
          "Failed to update Finny's style immediately. The change will take effect on your next message.",
          [{ text: "OK" }]
        );
        // Non-critical, don't throw - style is saved in DB, cache will refresh eventually
      }
    } catch (error: any) {
      logger.error("[FinnyStyle] Error saving style:", error);
      // Revert to previous style on error
      Alert.alert(
        "Error",
        "Failed to save style preference. Please try again.",
        [{ text: "OK" }]
      );
      // Reload from database to get the correct value
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("finny_style")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.finny_style) {
          setSelectedStyle(
            profile.finny_style as "conversational" | "direct" | "witty"
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
        <ChatScreenHeader title="Finny's Style" onBack={onBack} />

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
