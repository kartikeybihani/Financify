import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import IconButton from "@/src/components/shared/IconButton";
import DetailedMemoriesScreen from "@/app/(tabs)/chat/detailed-memories";
import FinnyStyleScreen from "@/app/(tabs)/chat/finny-style";
import FinnyCheckinScreen from "@/app/(tabs)/chat/finny-checkin";
import LegalSummaryScreen from "@/app/(tabs)/chat/legal-summary";
import HowFinnyWorksScreen from "@/app/(tabs)/chat/how-finny-works";
import ChatHistoryScreen from "@/app/(tabs)/chat/history";
import { useChatContext } from "@/src/contexts/ChatContext";
import { SettingItemProps } from "@/src/types/plaid";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import {
  getCachedFinnyStyle,
  getCachedCheckinFrequency,
  cacheFinnyStyle,
  cacheCheckinFrequency,
} from "@/src/utils/profile/profileCache";

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
    paddingTop: Platform.OS === "ios" ? 7 : 11,
    paddingBottom: 9,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  headerTitle: {
    fontSize: responsiveFontSize(17),
    fontWeight: "600" as const,
    color: "#fff",
    letterSpacing: 0.1,
    flex: 1,
    textAlign: "center" as const,
  },
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(12),
  },
  contentContainer: {
    paddingBottom: responsivePadding(126),
  },
  section: {
    marginBottom: responsivePadding(22),
  },
  sectionHeader: {
    marginBottom: responsivePadding(10),
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: responsiveFontSize(12),
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.52)",
    letterSpacing: 0.2,
  },
  settingsGroupContent: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  settingItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: responsivePadding(14),
    paddingHorizontal: responsivePadding(14),
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  settingLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
  },
  settingIcon: {
    marginRight: responsivePadding(11),
    width: 18,
    alignItems: "center" as const,
  },
  settingText: {
    fontSize: responsiveFontSize(14),
    color: "#fff",
    fontWeight: "600" as const,
    flex: 1,
  },
  settingDescription: {
    fontSize: responsiveFontSize(12),
    color: "rgba(255, 255, 255, 0.52)",
    marginTop: 3,
    lineHeight: responsiveFontSize(16),
  },
  switchContainer: {
    marginLeft: responsivePadding(10),
  },
  footer: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0F0F0F",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(10),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  clearChatButton: {
    backgroundColor: "rgba(255, 255, 255, 0.065)",
    borderRadius: 14,
    paddingVertical: responsivePadding(14),
    paddingHorizontal: responsivePadding(16),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center" as const,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  clearChatButtonText: {
    color: "#F5F7FA",
    fontSize: responsiveFontSize(15),
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
  modalContainer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0F0F0F",
  },
  memoriesContainer: {
    zIndex: 10,
  },
};

const SettingItem: React.FC<SettingItemProps> = ({
  icon,
  title,
  description,
  onPress,
  rightElement,
  showBorder = true,
}) => (
  <TouchableOpacity
    style={[styles.settingItem, showBorder && styles.settingItemBorder]}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={styles.settingLeft}>
      {icon && (
        <View style={styles.settingIcon}>
          <Ionicons name={icon as any} size={18} color="#7FAEFF" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.settingText}>{title}</Text>
        {description && (
          <Text style={styles.settingDescription}>{description}</Text>
        )}
      </View>
    </View>
    {rightElement && <View style={styles.switchContainer}>{rightElement}</View>}
  </TouchableOpacity>
);

export default function FinnySettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string }>();
  const { clearChat } = useChatContext();
  const [showMemories, setShowMemories] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showLegalSummary, setShowLegalSummary] = useState(false);
  const [showHowFinnyWorks, setShowHowFinnyWorks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [slideAnimation] = useState(new Animated.Value(0));
  const [styleSlideAnimation] = useState(new Animated.Value(0));
  const [checkinSlideAnimation] = useState(new Animated.Value(0));
  const [legalSummarySlideAnimation] = useState(new Animated.Value(0));
  const [howFinnyWorksSlideAnimation] = useState(new Animated.Value(0));
  const [historySlideAnimation] = useState(new Animated.Value(0));
  // Initialize with cached values immediately to avoid flicker
  const [currentStyle, setCurrentStyle] = useState<
    "conversational" | "direct" | "witty" | null
  >(null);
  const [currentCheckinFrequency, setCurrentCheckinFrequency] = useState<
    "daily" | "3times" | "weekly" | "never" | null
  >(null);

  const loadSettings = async () => {
    // Step 1: Load from memory cache immediately (truly instant, synchronous)
    const cachedStyle = getCachedFinnyStyle();
    const cachedCheckin = getCachedCheckinFrequency();

    setCurrentStyle(cachedStyle || "conversational");
    setCurrentCheckinFrequency(cachedCheckin || "daily");

    // Step 2: Fetch from DB to verify and update cache if different
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        logger.warn("[FinnySettings] No authenticated user found");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("finny_style, checkin_frequency")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        logger.error("[FinnySettings] Error loading settings:", error);
        return;
      }

      if (profile?.finny_style) {
        const dbStyle = profile.finny_style as
          | "conversational"
          | "direct"
          | "witty";
        setCurrentStyle(dbStyle);
        // Update cache if DB value differs from cached
        if (dbStyle !== cachedStyle) {
          await cacheFinnyStyle(dbStyle);
        }
      }
      if (profile?.checkin_frequency) {
        const dbCheckin = profile.checkin_frequency as
          | "daily"
          | "3times"
          | "weekly"
          | "never";
        setCurrentCheckinFrequency(dbCheckin);
        // Update cache if DB value differs from cached
        if (dbCheckin !== cachedCheckin) {
          await cacheCheckinFrequency(dbCheckin);
        }
      }
    } catch (error) {
      logger.error("[FinnySettings] Error loading settings:", error);
    }
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.open === "memories" && !showMemories) {
      openMemories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.open, showMemories]);

  const openMemories = () => {
    setShowMemories(true);
    Animated.timing(slideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeMemories = () => {
    Animated.timing(slideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowMemories(false);
    });
  };

  const openStyle = () => {
    setShowStyle(true);
    Animated.timing(styleSlideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeStyle = async () => {
    Animated.timing(styleSlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowStyle(false);
      // Reload settings to get updated style (will use cache for instant display)
      loadSettings();
    });
  };

  const openCheckin = () => {
    setShowCheckin(true);
    Animated.timing(checkinSlideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeCheckin = async () => {
    Animated.timing(checkinSlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowCheckin(false);
      // Reload settings to get updated check-in frequency (will use cache for instant display)
      loadSettings();
    });
  };

  const openLegalSummary = () => {
    setShowLegalSummary(true);
    Animated.timing(legalSummarySlideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeLegalSummary = () => {
    Animated.timing(legalSummarySlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowLegalSummary(false);
    });
  };

  const openHowFinnyWorks = () => {
    setShowHowFinnyWorks(true);
    Animated.timing(howFinnyWorksSlideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeHowFinnyWorks = () => {
    Animated.timing(howFinnyWorksSlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowHowFinnyWorks(false);
    });
  };

  const openHistory = () => {
    setShowHistory(true);
    Animated.timing(historySlideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeHistory = () => {
    Animated.timing(historySlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowHistory(false);
    });
  };

  const closeHistoryAndSettings = () => {
    historySlideAnimation.setValue(0);
    setShowHistory(false);
    router.back();
  };

  const handleClearChat = async () => {
    await clearChat();
    router.replace("/(tabs)/chat");
    router.back();
  };

  const settingsTranslateX = slideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -screenWidth],
  });

  const memoriesTranslateX = slideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });

  const styleSettingsTranslateX = styleSlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -screenWidth],
  });

  const styleTranslateX = styleSlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });

  const checkinSettingsTranslateX = checkinSlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -screenWidth],
  });

  const checkinTranslateX = checkinSlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });

  const legalSummarySettingsTranslateX = legalSummarySlideAnimation.interpolate(
    {
      inputRange: [0, 1],
      outputRange: [0, -screenWidth],
    },
  );

  const legalSummaryTranslateX = legalSummarySlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });

  const howFinnyWorksSettingsTranslateX =
    howFinnyWorksSlideAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -screenWidth],
    });

  const howFinnyWorksTranslateX = howFinnyWorksSlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });

  const historySettingsTranslateX = historySlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -screenWidth],
  });

  const historyTranslateX = historySlideAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });

  const getStyleDescription = (
    style: "conversational" | "direct" | "witty" | null,
  ): string => {
    if (!style) return "Loading...";
    switch (style) {
      case "conversational":
        return "Conversational";
      case "direct":
        return "Direct";
      case "witty":
        return "Witty";
      default:
        return "Conversational";
    }
  };

  const getCheckinDescription = (
    frequency: "daily" | "3times" | "weekly" | "never" | null,
  ): string => {
    if (!frequency) return "Loading...";
    switch (frequency) {
      case "daily":
        return "Daily";
      case "3times":
        return "3 Times a Week";
      case "weekly":
        return "Weekly";
      case "never":
        return "Never";
      default:
        return "Daily";
    }
  };

  const chevron = (
    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.28)" />
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Settings View */}
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [
                {
                  translateX: showStyle
                    ? styleSettingsTranslateX
                    : showCheckin
                      ? checkinSettingsTranslateX
                      : showLegalSummary
                        ? legalSummarySettingsTranslateX
                        : showHowFinnyWorks
                          ? howFinnyWorksSettingsTranslateX
                          : showHistory
                            ? historySettingsTranslateX
                            : settingsTranslateX,
                },
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <IconButton icon="close" onPress={() => router.back()} size={19} />
            <Text style={styles.headerTitle}>Finny settings</Text>
            <View style={{ width: 34 }} />
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Personalize Finny</Text>
              </View>
              <View style={styles.settingsGroupContent}>
                <SettingItem
                  icon="chatbubble-outline"
                  title="Style"
                  description={getStyleDescription(currentStyle)}
                  onPress={openStyle}
                  rightElement={chevron}
                />

                <SettingItem
                  icon="notifications-outline"
                  title="Check-in notifications"
                  description={getCheckinDescription(currentCheckinFrequency)}
                  onPress={openCheckin}
                  rightElement={chevron}
                />

                <SettingItem
                  icon="bookmark-outline"
                  title="Memories"
                  description="What Finny remembers about you"
                  onPress={openMemories}
                  rightElement={chevron}
                  showBorder={false}
                />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Conversation</Text>
              </View>
              <View style={styles.settingsGroupContent}>
                <SettingItem
                  icon="time-outline"
                  title="History"
                  onPress={openHistory}
                  rightElement={chevron}
                  showBorder={false}
                />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>About Finny</Text>
              </View>
              <View style={styles.settingsGroupContent}>
                <SettingItem
                  icon="document-text-outline"
                  title="Legal summary"
                  onPress={openLegalSummary}
                  rightElement={chevron}
                />

                <SettingItem
                  icon="help-circle-outline"
                  title="How Finny works"
                  onPress={openHowFinnyWorks}
                  rightElement={chevron}
                  showBorder={false}
                />
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, responsivePadding(14)) },
            ]}
          >
            <TouchableOpacity
              style={styles.clearChatButton}
              onPress={handleClearChat}
              activeOpacity={0.7}
            >
              <Text style={styles.clearChatButtonText}>Start new chat</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Memories View */}
        {showMemories && (
          <Animated.View
            style={[
              styles.modalContainer,
              styles.memoriesContainer,
              {
                transform: [{ translateX: memoriesTranslateX }],
              },
            ]}
          >
            <DetailedMemoriesScreen onBack={closeMemories} />
          </Animated.View>
        )}

        {/* Style View */}
        {showStyle && (
          <Animated.View
            style={[
              styles.modalContainer,
              styles.memoriesContainer,
              {
                transform: [{ translateX: styleTranslateX }],
              },
            ]}
          >
            <FinnyStyleScreen onBack={closeStyle} />
          </Animated.View>
        )}

        {/* Check-in View */}
        {showCheckin && (
          <Animated.View
            style={[
              styles.modalContainer,
              styles.memoriesContainer,
              {
                transform: [{ translateX: checkinTranslateX }],
              },
            ]}
          >
            <FinnyCheckinScreen onBack={closeCheckin} />
          </Animated.View>
        )}

        {/* Legal Summary View */}
        {showLegalSummary && (
          <Animated.View
            style={[
              styles.modalContainer,
              styles.memoriesContainer,
              {
                transform: [{ translateX: legalSummaryTranslateX }],
              },
            ]}
          >
            <LegalSummaryScreen onBack={closeLegalSummary} />
          </Animated.View>
        )}

        {/* How Finny Works View */}
        {showHowFinnyWorks && (
          <Animated.View
            style={[
              styles.modalContainer,
              styles.memoriesContainer,
              {
                transform: [{ translateX: howFinnyWorksTranslateX }],
              },
            ]}
          >
            <HowFinnyWorksScreen onBack={closeHowFinnyWorks} />
          </Animated.View>
        )}

        {/* History View */}
        {showHistory && (
          <Animated.View
            style={[
              styles.modalContainer,
              styles.memoriesContainer,
              {
                transform: [{ translateX: historyTranslateX }],
              },
            ]}
          >
            <ChatHistoryScreen
              onBack={closeHistory}
              onSessionSelected={closeHistoryAndSettings}
            />
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}
