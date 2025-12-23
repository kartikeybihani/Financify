import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  Image,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { MemorySummary, MemoriesScreenProps } from "@/src/types/plaid";
import DetailedMemoriesScreen from "@/app/(tabs)/chat/detailed-memories";
import FinnyLoadingIndicator from "@/src/components/shared/FinnyLoadingIndicator";
import ChatScreenHeader from "@/src/components/shared/ChatScreenHeader";

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

export default function MemoriesScreen({ onBack }: MemoriesScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuthNavigation();

  // Enable LayoutAnimation on Android
  if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const [memorySummaries, setMemorySummaries] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(
    new Set()
  );
  const chevronAnimations = React.useRef(
    new Map<string, Animated.Value>()
  ).current;

  // Track both data fetch and animation completion
  const dataFetchedRef = React.useRef(false);
  const animationCompletedRef = React.useRef(false);

  // Detailed memories screen animation state
  const [showDetailedMemories, setShowDetailedMemories] = useState(false);
  const [detailedMemoriesSlideAnimation] = useState(new Animated.Value(0));

  // Fetch memories data when component mounts
  useEffect(() => {
    if (session?.user?.id) {
      // Reset flags when component mounts
      dataFetchedRef.current = false;
      animationCompletedRef.current = false;
      fetchMemoriesData();
    }
  }, [session]);

  // Helper function to check if both are complete and hide loading
  const checkAndHideLoading = () => {
    if (dataFetchedRef.current && animationCompletedRef.current) {
      setLoading(false);
    }
  };

  const fetchMemoriesData = async () => {
    try {
      setLoading(true);

      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      const response = await authenticatedFetch(`${BASE_URL}/api/memory`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch memories: ${response.statusText}`);
      }

      const data = await response.json();
      const memories = data.memories || [];

      // Map Supermemory documents from v3/documents/list endpoint
      // Each document includes: id, title, status, type, summary (AI-generated), metadata, containerTags, createdAt, updatedAt
      const mappedMemories: MemorySummary[] = memories.map(
        (document: any, index: number) => {
          const title = document.title || "";
          const summary = document.summary || "";
          const displayText = title ? `${title}\n\n${summary}` : summary;
          const id = document.id || `document-${Date.now()}-${index}`;
          const createdAt =
            document.updatedAt ||
            document.createdAt ||
            new Date().toISOString();

          return {
            id,
            summary_text: displayText,
            title,
            summary,
            created_at: createdAt,
            _originalMemory: document,
          };
        }
      );

      // Sort by date (newest first)
      mappedMemories.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setMemorySummaries(mappedMemories);
    } catch (error) {
      console.error("Error fetching memories:", error);
      setMemorySummaries([]);
    } finally {
      dataFetchedRef.current = true;
      checkAndHideLoading();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Truncate text to approximately 30 words
  const truncateText = (text: string, maxWords: number = 30): string => {
    if (!text) return "";
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ") + "...";
  };

  // Toggle summary expansion - only one can be expanded at a time
  const toggleSummaryExpansion = (memoryId: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        200,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );

    const ensureAnimation = (id: string) => {
      if (!chevronAnimations.has(id)) {
        chevronAnimations.set(id, new Animated.Value(0));
      }
      return chevronAnimations.get(id)!;
    };

    setExpandedSummaries((prev) => {
      const prevExpandedId = prev.size ? Array.from(prev)[0] : null;
      const newSet = new Set(prev);

      let nextExpandedId: string | null = null;
      if (newSet.has(memoryId)) {
        // If already expanded, collapse it
        newSet.delete(memoryId);
      } else {
        // If not expanded, collapse all others and expand this one
        newSet.clear();
        newSet.add(memoryId);
        nextExpandedId = memoryId;
      }

      // Animate previous expanded chevron to collapsed
      if (prevExpandedId && prevExpandedId !== memoryId) {
        const anim = ensureAnimation(prevExpandedId);
        Animated.timing(anim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }

      // Animate current chevron based on new state
      const currentAnim = ensureAnimation(memoryId);
      Animated.timing(currentAnim, {
        toValue: nextExpandedId ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();

      return newSet;
    });
  };

  // Handle opening detailed memories screen with animation
  const handleOpenDetailModal = () => {
    setShowDetailedMemories(true);
    Animated.timing(detailedMemoriesSlideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleCloseDetailModal = () => {
    Animated.timing(detailedMemoriesSlideAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowDetailedMemories(false);
    });
  };

  // Animation interpolation
  const detailedMemoriesTranslateX = detailedMemoriesSlideAnimation.interpolate(
    {
      inputRange: [0, 1],
      outputRange: [screenWidth, 0],
    }
  );

  const hasMemories = memorySummaries && memorySummaries.length > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <ChatScreenHeader title="Memories" onBack={onBack} />

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <FinnyLoadingIndicator
              message="Loading memories..."
              imageSource={require("../../../assets/images/thinking2.png")}
              duration={2000}
              onComplete={() => {
                animationCompletedRef.current = true;
                checkAndHideLoading();
              }}
            />
          ) : !hasMemories ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <View style={styles.emptyImageCircle}>
                  <Image
                    source={require("../../../assets/images/thinking2.png")}
                    resizeMode="contain"
                    style={styles.emptyImage}
                  />
                </View>
              </View>
              <Text style={styles.emptyTitle}>No Memories Yet</Text>
              <Text style={styles.emptyDescription}>
                Finny will start remembering your preferences and important
                details as you chat. Keep the conversation going!
              </Text>
            </View>
          ) : (
            <View style={styles.memorySection}>
              {/* Detailed List Button */}
              <TouchableOpacity
                style={styles.detailButton}
                onPress={handleOpenDetailModal}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={["rgba(15, 76, 129, 0.95)", "rgba(9, 38, 76, 0.9)"]}
                  style={styles.detailButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.detailButtonContent}>
                    <Text style={styles.detailButtonText}>
                      View memories in detail
                    </Text>
                    <Ionicons
                      name="arrow-forward-circle"
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Memory Summaries */}
              {memorySummaries.map((memorySummary, index) => {
                const isExpanded = expandedSummaries.has(memorySummary.id);
                const fullText =
                  memorySummary.summary || memorySummary.summary_text || "";
                const displayText = isExpanded
                  ? fullText
                  : truncateText(fullText, 30);

                // Ensure chevron animation value exists for this memory
                if (!chevronAnimations.has(memorySummary.id)) {
                  chevronAnimations.set(
                    memorySummary.id,
                    new Animated.Value(isExpanded ? 1 : 0)
                  );
                }
                const chevronAnim = chevronAnimations.get(
                  memorySummary.id
                ) as Animated.Value;
                const chevronRotate = chevronAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "90deg"], // right → down
                });

                return (
                  <TouchableOpacity
                    key={memorySummary.id || index}
                    style={[
                      styles.summaryCard,
                      isExpanded && styles.summaryCardExpanded,
                    ]}
                    onPress={() => toggleSummaryExpansion(memorySummary.id)}
                    activeOpacity={0.7}
                  >
                    {/* Expand/Collapse Icon - Top Right */}
                    {fullText.split(/\s+/).length > 30 && (
                      <Animated.View
                        style={[
                          styles.expandIconContainer,
                          { transform: [{ rotate: chevronRotate }] },
                        ]}
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="rgba(255, 255, 255, 0.6)"
                        />
                      </Animated.View>
                    )}
                    <View style={styles.summaryHeader}>
                      <View style={styles.summaryLeft}>
                        <Text style={styles.dateLabel}>
                          {formatDate(memorySummary.created_at)}
                        </Text>
                        {/* Display title if available */}
                        {memorySummary.title && (
                          <Text style={styles.summaryTitle}>
                            {memorySummary.title}
                          </Text>
                        )}
                        <Text style={styles.summaryText}>{displayText}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Bottom padding */}
          <View style={{ height: responsivePadding(60) + insets.bottom }} />
        </ScrollView>

        {/* Detailed Memories Screen */}
        {showDetailedMemories && (
          <Animated.View
            style={[
              styles.modalContainer,
              {
                transform: [{ translateX: detailedMemoriesTranslateX }],
              },
            ]}
          >
            <DetailedMemoriesScreen onBack={handleCloseDetailModal} />
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(24),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(32),
  },
  emptyIcon: {
    marginBottom: responsivePadding(16),
  },
  emptyImageCircle: {
    width: screenWidth * 0.45,
    height: screenWidth * 0.45,
    borderRadius: (screenWidth * 0.45) / 2,
    overflow: "hidden" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyImage: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: responsiveFontSize(18),
    fontWeight: "600" as const,
    color: "#fff",
    textAlign: "center" as const,
    marginBottom: responsivePadding(8),
  },
  emptyDescription: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center" as const,
    lineHeight: responsiveFontSize(20),
  },
  memorySection: {
    marginBottom: responsivePadding(24),
  },
  detailButton: {
    width: screenWidth * 0.8,
    alignSelf: "center" as const,
    marginBottom: responsivePadding(20),
    borderRadius: 24,
    overflow: "hidden" as const,
    shadowColor: "#020617",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  detailButtonGradient: {
    paddingVertical: responsivePadding(12),
    paddingHorizontal: responsivePadding(18),
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: "rgba(15, 23, 42, 0.8)",
    backgroundColor: "rgba(2, 6, 23, 0.95)",
  },
  detailButtonContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  detailButtonText: {
    fontSize: responsiveFontSize(12),
    fontWeight: "600" as const,
    color: "#fff",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  dateLabel: {
    fontSize: responsiveFontSize(10),
    color: "rgba(255, 255, 255, 0.55)",
    marginBottom: responsivePadding(8),
    fontWeight: "500" as const,
    letterSpacing: 0.2,
  },
  summaryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 16,
    paddingVertical: responsivePadding(12),
    paddingHorizontal: responsivePadding(14),
    marginBottom: responsivePadding(10),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    transition: "all 0.3s ease",
    position: "relative" as const,
  },
  summaryCardExpanded: {
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderColor: "rgba(74, 144, 226, 0.3)",
    borderWidth: 1.5,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  summaryHeader: {
    flex: 1,
  },
  summaryLeft: {
    flex: 1,
  },
  expandIconContainer: {
    position: "absolute" as const,
    top: responsivePadding(12),
    right: responsivePadding(12),
    padding: 4,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    zIndex: 10,
  },
  summaryTitle: {
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
    color: "#fff",
    marginBottom: responsivePadding(6),
    letterSpacing: 0.1,
    lineHeight: responsiveFontSize(19),
  },
  trashButton: {
    padding: 8,
  },
  summaryText: {
    fontSize: responsiveFontSize(12),
    color: "rgba(255, 255, 255, 0.88)",
    lineHeight: responsiveFontSize(18),
    fontWeight: "400" as const,
    letterSpacing: 0.05,
  },
  modalContainer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0F0F0F",
    zIndex: 10,
  },
};
