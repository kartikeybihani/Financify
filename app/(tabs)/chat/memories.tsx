import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Dimensions } from "react-native";
import { useAuth } from "@/app/_contexts/AuthContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/app/_lib/supabase/supabase";
import { MemorySummary, MemoriesScreenProps } from "@/app/_types/plaid";

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

export default function MemoriesScreen({
  onBack,
  preloadedData,
}: MemoriesScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };
  const [memorySummaries, setMemorySummaries] = useState<MemorySummary[]>(
    preloadedData || []
  );
  const [loading, setLoading] = useState(
    !preloadedData || preloadedData.length === 0
  );

  const handleDeleteMemory = (memoryId: string) => {
    Alert.alert(
      "Delete Memory",
      `Are you sure you want to delete this memory? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMemorySummary(memoryId),
        },
      ]
    );
  };

  const deleteMemorySummary = async (memoryId: string) => {
    try {
      // Delete the specific memory summary
      const { error: summaryError } = await supabase
        .from("memory_summary")
        .delete()
        .eq("id", memoryId)
        .eq("user_id", session?.user?.id);

      if (summaryError) throw summaryError;

      // Remove the deleted memory from the local state
      setMemorySummaries((prev) =>
        prev.filter((memory) => memory.id !== memoryId)
      );
    } catch (error) {
      console.error("Error deleting memory:", error);
      Alert.alert("Error", "Failed to delete memory. Please try again.");
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

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={styles.headerTitle}>Memories</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4A90E2" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const hasMemories = memorySummaries && memorySummaries.length > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
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
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Memories</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {!hasMemories ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="bookmark-outline"
                  size={64}
                  color="rgba(255, 255, 255, 0.3)"
                />
              </View>
              <Text style={styles.emptyTitle}>No Memories Yet</Text>
              <Text style={styles.emptyDescription}>
                Finny will start remembering your preferences and important
                details as you chat. Keep the conversation going!
              </Text>
            </View>
          ) : (
            <View style={styles.memorySection}>
              {/* Memory Summaries */}
              {memorySummaries.map((memorySummary, index) => (
                <View
                  key={memorySummary.id || index}
                  style={styles.summaryCard}
                >
                  <View style={styles.summaryHeader}>
                    <View style={styles.summaryLeft}>
                      <Text style={styles.dateLabel}>
                        {formatDate(memorySummary.created_at)}
                      </Text>
                      <Text style={styles.summaryText}>
                        {memorySummary.summary_text}
                      </Text>
                    </View>
                    <View style={styles.summaryRight}>
                      <TouchableOpacity
                        style={styles.trashButton}
                        onPress={() => handleDeleteMemory(memorySummary.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={28}
                          color="#FF4444"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Bottom padding */}
          <View style={{ height: responsivePadding(40) }} />
        </ScrollView>
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
    padding: 6,
  },
  closeButtonCircle: {
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
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: 0,
  },
  summaryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingVertical: responsivePadding(12),
    paddingHorizontal: responsivePadding(14),
    marginBottom: responsivePadding(20),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  summaryLeft: {
    flex: 1,
    marginRight: responsivePadding(12),
  },
  summaryRight: {
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  summaryTitle: {
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
    color: "#fff",
  },
  trashButton: {
    padding: 8,
  },
  summaryText: {
    fontSize: responsiveFontSize(12),
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: responsiveFontSize(16),
    fontWeight: "600" as const,
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
};
