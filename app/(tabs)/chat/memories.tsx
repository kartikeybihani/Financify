import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
  UIManager,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Dimensions } from "react-native";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { MemorySummary, MemoriesScreenProps } from "@/src/types/plaid";
import EditMemoryModal from "@/src/components/modals/EditMemoryModal";
import DetailedMemoriesScreen from "@/app/(tabs)/chat/detailed-memories";
import FinnyLoadingIndicator from "@/src/components/shared/FinnyLoadingIndicator";

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

export default function MemoriesScreen({ onBack }: MemoriesScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthNavigation();

  // Enable LayoutAnimation on Android
  if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };
  const [memorySummaries, setMemorySummaries] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMemory, setEditingMemory] = useState<MemorySummary | null>(
    null
  );
  const [editText, setEditText] = useState("");
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [updatingMemoryId, setUpdatingMemoryId] = useState<string | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(
    new Set()
  );
  const chevronAnimations = React.useRef(
    new Map<string, Animated.Value>()
  ).current;

  // Detailed memories screen animation state
  const [showDetailedMemories, setShowDetailedMemories] = useState(false);
  const [detailedMemoriesSlideAnimation] = useState(new Animated.Value(0));

  // Fetch memories data when component mounts
  useEffect(() => {
    if (session?.user?.id) {
      fetchMemoriesData();
    }
  }, [session]);

  const fetchMemoriesData = async () => {
    try {
      setLoading(true);
      // console.log(
      //   "Fetching memories from Supermemory for user:",
      //   session?.user?.id
      // );

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

      // Debug logging (can be removed later)
      // console.log("🔍 [MEMORIES] Raw API response:", JSON.stringify(data, null, 2));
      // console.log("🔍 [MEMORIES] Memories array:", memories);

      // OLD IMPLEMENTATION: Map Supermemory memories from v4/search endpoint
      // Supermemory v4/search returns memories with structure:
      // { id, memory (text), updatedAt, documents: [{ id, metadata: { timestamp } }] }
      // const mappedMemories: MemorySummary[] = memories.map(
      //   (memory: any, index: number) => {
      //     // The actual memory text is in the "memory" field
      //     const content = memory.memory || memory.content || "";

      //     // Use the memory ID, but also store document ID if available for updates/deletes
      //     const id = memory.id || `memory-${Date.now()}-${index}`;
      //     const documentId = memory.documents?.[0]?.id || null;

      //     // Prefer updatedAt, fallback to document metadata timestamp, then createdAt
      //     const createdAt =
      //       memory.updatedAt ||
      //       memory.documents?.[0]?.metadata?.timestamp ||
      //       memory.documents?.[0]?.createdAt ||
      //       memory.created_at ||
      //       memory.metadata?.timestamp ||
      //       new Date().toISOString();

      //     return {
      //       id,
      //       summary_text: content,
      //       created_at: createdAt,
      //       // Store original memory object for API operations
      //       _originalMemory: memory,
      //     };
      //   }
      // );

      // NEW IMPLEMENTATION: Map Supermemory documents from v3/documents/list endpoint
      // Each document includes: id, title, status, type, summary (AI-generated), metadata, containerTags, createdAt, updatedAt
      const mappedMemories: MemorySummary[] = memories.map(
        (document: any, index: number) => {
          // Use title and summary from the document
          const title = document.title || "";
          const summary = document.summary || "";

          // Combine title and summary for display
          // We'll display title as a header and summary as the content
          const displayText = title ? `${title}\n\n${summary}` : summary;

          const id = document.id || `document-${Date.now()}-${index}`;

          // Use updatedAt or createdAt
          const createdAt =
            document.updatedAt ||
            document.createdAt ||
            new Date().toISOString();

          return {
            id,
            summary_text: displayText,
            title: title, // Store title separately for potential use
            summary: summary, // Store summary separately
            created_at: createdAt,
            // Store original document object for API operations
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
      setLoading(false);
    }
  };

  const handleEditMemory = (memory: MemorySummary) => {
    setEditingMemory(memory);
    setEditText(memory.summary_text);
  };

  const handleCancelEdit = () => {
    setEditingMemory(null);
    setEditText("");
  };

  const handleSaveEdit = async () => {
    if (!editingMemory || !editText.trim()) {
      Alert.alert("Error", "Memory text cannot be empty");
      return;
    }

    try {
      setUpdatingMemoryId(editingMemory.id);
      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      // Get document ID (required for Supermemory API)
      const originalMemory = (editingMemory as any)._originalMemory;
      const documentId = originalMemory?.documents?.[0]?.id;

      if (!documentId) {
        Alert.alert(
          "Error",
          "Cannot update: Document ID not found. Please refresh and try again."
        );
        return;
      }

      console.log("🔍 [MEMORIES] Updating memory:", {
        memoryId: editingMemory.id,
        documentId: documentId,
        contentLength: editText.trim().length,
      });

      const response = await authenticatedFetch(`${BASE_URL}/api/memory`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memoryId: editingMemory.id,
          documentId: documentId, // Required: use document ID
          content: editText.trim(),
        }),
      });

      console.log("🔍 [MEMORIES] Update response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        console.error("❌ [MEMORIES] Update error:", errorData);
        throw new Error(errorData.error || "Failed to update memory");
      }

      // Update local state
      setMemorySummaries((prev) =>
        prev.map((m) =>
          m.id === editingMemory.id
            ? { ...m, summary_text: editText.trim() }
            : m
        )
      );

      setEditingMemory(null);
      setEditText("");
      Alert.alert("Success", "Memory updated successfully");
    } catch (error: any) {
      console.error("Error updating memory:", error);
      Alert.alert("Error", error.message || "Failed to update memory");
    } finally {
      setUpdatingMemoryId(null);
    }
  };

  const handleDeleteMemory = (memoryId: string) => {
    Alert.alert(
      "Delete Memory",
      "Are you sure you want to delete this memory? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMemory(memoryId),
        },
      ]
    );
  };

  const deleteMemory = async (memoryId: string) => {
    try {
      setDeletingMemoryId(memoryId);

      // Optimistic update - remove from UI immediately
      const originalMemories = [...memorySummaries];
      setMemorySummaries((prev) => prev.filter((m) => m.id !== memoryId));

      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      // Get document ID (required for Supermemory API)
      const memory = memorySummaries.find((m) => m.id === memoryId);
      const originalMemory = (memory as any)?._originalMemory;
      const documentId = originalMemory?.documents?.[0]?.id;

      if (!documentId) {
        Alert.alert(
          "Error",
          "Cannot delete: Document ID not found. Please refresh and try again."
        );
        // Restore optimistic update
        setMemorySummaries((prev) => {
          const restored = [...prev];
          if (memory) {
            restored.push(memory);
            restored.sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
          }
          return restored;
        });
        return;
      }

      console.log("🔍 [MEMORIES] Deleting memory:", {
        memoryId,
        documentId,
      });

      const queryParams = new URLSearchParams({
        memoryId,
        documentId, // Required: use document ID
      });

      const response = await authenticatedFetch(
        `${BASE_URL}/api/memory?${queryParams.toString()}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("🔍 [MEMORIES] Delete response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        console.error("❌ [MEMORIES] Delete error:", errorData);
        throw new Error(errorData.error || "Failed to delete memory");
      }

      // Success - memory already removed via optimistic update
      console.log(`Memory deleted successfully: ${memoryId}`);
    } catch (error: any) {
      console.error("Error deleting memory:", error);
      // Restore original state on error
      setMemorySummaries((prev) => {
        const restored = [...prev];
        const deletedMemory = memorySummaries.find((m) => m.id === memoryId);
        if (deletedMemory) {
          restored.push(deletedMemory);
          restored.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
        }
        return restored;
      });
      Alert.alert("Error", error.message || "Failed to delete memory");
    } finally {
      setDeletingMemoryId(null);
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

  // Removed early return - show header consistently even during loading

  const hasMemories = memorySummaries && memorySummaries.length > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleBack}
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
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Memories</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <FinnyLoadingIndicator
              message="Loading memories..."
              imageSource={require("../../../assets/images/thinking2.png")}
            />
          ) : !hasMemories ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <View style={styles.emptyImageCircle}>
                  <Image
                    source={require("../../../assets/images/thinking2.png")}
                    style={styles.emptyImage}
                    resizeMode="cover"
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
                      {/* Edit and Delete icons - commented out per user request */}
                      {/* <View style={styles.summaryRight}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => handleEditMemory(memorySummary)}
                          activeOpacity={0.7}
                          disabled={deletingMemoryId === memorySummary.id}
                        >
                          <Ionicons
                            name="create-outline"
                            size={22}
                            color="#4A90E2"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.trashButton}
                          onPress={() => handleDeleteMemory(memorySummary.id)}
                          activeOpacity={0.7}
                          disabled={
                            deletingMemoryId === memorySummary.id ||
                            updatingMemoryId === memorySummary.id
                          }
                        >
                          {deletingMemoryId === memorySummary.id ? (
                            <ActivityIndicator size="small" color="#FF4444" />
                          ) : (
                            <Ionicons
                              name="trash-outline"
                              size={22}
                              color="#FF4444"
                            />
                          )}
                        </TouchableOpacity>
                      </View> */}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Bottom padding */}
          <View style={{ height: responsivePadding(60) + insets.bottom }} />
        </ScrollView>

        {/* Edit Memory Modal */}
        <EditMemoryModal
          visible={editingMemory !== null}
          editText={editText}
          onTextChange={setEditText}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          isSaving={updatingMemoryId !== null}
        />

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
  content: {
    flex: 1,
    paddingHorizontal: responsivePadding(16),
    paddingTop: responsivePadding(24),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
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
    width: "100%",
    height: "100%",
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
  memoryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: responsivePadding(16),
    marginBottom: responsivePadding(12),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  memoryHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: responsivePadding(8),
  },
  memoryType: {
    fontSize: responsiveFontSize(12),
    fontWeight: "600" as const,
    color: "#4A90E2",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginRight: responsivePadding(8),
  },
  memoryKey: {
    fontSize: responsiveFontSize(15),
    fontWeight: "600" as const,
    color: "#fff",
    flex: 1,
  },
  memoryValue: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: responsiveFontSize(20),
    marginTop: responsivePadding(4),
  },
  memoryConfidence: {
    fontSize: responsiveFontSize(11),
    color: "rgba(255, 255, 255, 0.4)",
    marginTop: responsivePadding(6),
    fontStyle: "italic" as const,
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
  summaryRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  editButton: {
    padding: 8,
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
  clearMemoriesButton: {
    backgroundColor: "rgba(255, 68, 68, 0.15)",
    borderRadius: 12,
    paddingVertical: responsivePadding(16),
    paddingHorizontal: responsivePadding(16),
    marginTop: responsivePadding(24),
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.3)",
    alignItems: "center" as const,
  },
  clearMemoriesButtonText: {
    color: "#FF4444",
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(20),
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: responsivePadding(20),
    width: screenWidth * 0.9,
    maxWidth: 500,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: responsivePadding(16),
  },
  modalTitle: {
    fontSize: responsiveFontSize(20),
    fontWeight: "600" as const,
    color: "#fff",
  },
  modalCloseButton: {
    padding: 4,
  },
  editInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: responsivePadding(12),
    color: "#fff",
    fontSize: responsiveFontSize(14),
    minHeight: 120,
    textAlignVertical: "top" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: responsivePadding(16),
  },
  modalActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 12,
  },
  modalButton: {
    paddingVertical: responsivePadding(10),
    paddingHorizontal: responsivePadding(20),
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
  },
  saveButton: {
    backgroundColor: "#4A90E2",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
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
