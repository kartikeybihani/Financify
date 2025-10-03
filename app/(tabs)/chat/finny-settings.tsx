import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MemoriesScreen from "./memories";
import FinnyStyleScreen from "./finny-style";
import FinnyCheckinScreen from "./finny-checkin";
import { useAuth } from "../../_contexts/AuthContext";
import { createClient } from "@supabase/supabase-js";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// Initialize Supabase client
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

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
  closeButton: {
    padding: 3,
  },
  closeButtonCircle: {
    width: 35,
    height: 35,
    borderRadius: 20,
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
  sectionTitle: {
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
    color: "#fff",
    marginBottom: responsivePadding(12),
    letterSpacing: 0.3,
    marginLeft: 4,
  },
  settingsGroupContent: {
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
  settingItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: responsivePadding(12),
    paddingHorizontal: responsivePadding(16),
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  settingLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
  },
  settingIcon: {
    marginRight: responsivePadding(12),
    width: 20,
    alignItems: "center" as const,
  },
  settingText: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    fontWeight: "500" as const,
    flex: 1,
  },
  settingDescription: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 2,
  },
  switchContainer: {
    marginLeft: responsivePadding(12),
  },
  clearChatButton: {
    backgroundColor: "rgba(255, 68, 68, 0.15)",
    borderRadius: 12,
    paddingVertical: responsivePadding(16),
    paddingHorizontal: responsivePadding(16),
    marginTop: responsivePadding(24),
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.3)",
    alignItems: "center" as const,
  },
  clearChatButtonText: {
    color: "#FF4444",
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
  },
  infoItem: {
    paddingVertical: responsivePadding(12),
    paddingHorizontal: responsivePadding(16),
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    marginBottom: responsivePadding(8),
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.15)",
  },
  infoTitle: {
    fontSize: responsiveFontSize(15),
    color: "#fff",
    fontWeight: "500" as const,
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: responsiveFontSize(18),
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

interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showBorder?: boolean;
}

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

interface MemorySummary {
  summary_text: string;
  last_updated: string;
}

export default function FinnySettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const [showMemories, setShowMemories] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [slideAnimation] = useState(new Animated.Value(0));
  const [styleSlideAnimation] = useState(new Animated.Value(0));
  const [checkinSlideAnimation] = useState(new Animated.Value(0));
  const [preloadedMemorySummary, setPreloadedMemorySummary] =
    useState<MemorySummary | null>(null);

  // Pre-load memories data when component mounts
  useEffect(() => {
    if (session?.user?.id) {
      fetchMemoriesData();
    }
  }, [session]);

  const fetchMemoriesData = async () => {
    try {
      const { data: summaryData } = await supabase
        .from("memory_summary")
        .select("summary_text, last_updated")
        .eq("user_id", session?.user?.id)
        .single();

      setPreloadedMemorySummary(summaryData);
    } catch (error) {
      console.error("Error pre-loading memories:", error);
    }
  };

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

  const closeStyle = () => {
    Animated.timing(styleSlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowStyle(false);
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

  const closeCheckin = () => {
    Animated.timing(checkinSlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowCheckin(false);
    });
  };

  const handleClearChat = () => {
    Alert.alert(
      "Clear Chat History",
      "Are you sure you want to delete all conversation data? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // TODO: Implement clear chat functionality
            console.log("Clear chat history");
          },
        },
      ]
    );
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

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
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
                    : settingsTranslateX,
                },
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={styles.headerTitle}>Advisor Settings</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={[
                  "rgba(255, 255, 255, 0.15)",
                  "rgba(255, 255, 255, 0.05)",
                ]}
                style={styles.closeButtonCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Finny Section */}
            <View style={styles.section}>
              <View style={styles.settingsGroupContent}>
                <SettingItem
                  icon="chatbubble-outline"
                  title="Style"
                  description="Conversational"
                  onPress={openStyle}
                  rightElement={
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  }
                />

                <SettingItem
                  icon="notifications-outline"
                  title="Check-in notifications"
                  description="Like daily"
                  onPress={openCheckin}
                  rightElement={
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  }
                />

                <SettingItem
                  icon="bookmark-outline"
                  title="Memories"
                  onPress={openMemories}
                  rightElement={
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  }
                />

                <SettingItem
                  icon="time-outline"
                  title="History"
                  description="Check out the last 5 chats"
                  onPress={() => {
                    console.log("Open chat history");
                  }}
                  rightElement={
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  }
                  showBorder={false}
                />
              </View>
            </View>

            {/* General Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>General</Text>
              <View style={styles.settingsGroupContent}>
                <SettingItem
                  icon="document-text-outline"
                  title="Legal summary"
                  onPress={() => {
                    console.log("Open legal summary");
                  }}
                  rightElement={
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  }
                />

                <SettingItem
                  icon="help-circle-outline"
                  title="How does finny work?"
                  onPress={() => {
                    console.log("Open how finny works");
                  }}
                  rightElement={
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  }
                  showBorder={false}
                />
              </View>
            </View>

            {/* Clear Chat Button */}
            <TouchableOpacity
              style={styles.clearChatButton}
              onPress={handleClearChat}
              activeOpacity={0.7}
            >
              <Text style={styles.clearChatButtonText}>Clear Chat History</Text>
            </TouchableOpacity>

            {/* Bottom padding */}
            <View style={{ height: responsivePadding(40) }} />
          </ScrollView>
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
            <MemoriesScreen
              onBack={closeMemories}
              preloadedData={preloadedMemorySummary}
            />
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
      </SafeAreaView>
    </View>
  );
}
