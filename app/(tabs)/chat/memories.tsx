import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Dimensions } from "react-native";
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
    padding: 4,
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
  summaryCard: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    borderRadius: 12,
    padding: responsivePadding(16),
    marginBottom: responsivePadding(20),
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  summaryTitle: {
    fontSize: responsiveFontSize(16),
    fontWeight: "600" as const,
    color: "#4A90E2",
    marginBottom: responsivePadding(8),
  },
  summaryText: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: responsiveFontSize(20),
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

interface Memory {
  memory_type: string;
  key: string;
  value: string;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

interface MemorySummary {
  summary_text: string;
  last_updated: string;
}

const getMemoryTypeDisplayName = (type: string) => {
  switch (type) {
    case "profile_trait":
      return "Profile";
    case "constraint":
      return "Constraint";
    case "preference":
      return "Preference";
    case "future_plan":
      return "Future Plan";
    default:
      return type;
  }
};

const getMemoryTypeIcon = (type: string) => {
  switch (type) {
    case "profile_trait":
      return "person-outline";
    case "constraint":
      return "warning-outline";
    case "preference":
      return "heart-outline";
    case "future_plan":
      return "calendar-outline";
    default:
      return "information-circle-outline";
  }
};

export default function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memorySummary, setMemorySummary] = useState<MemorySummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.id) {
      fetchMemories();
    }
  }, [session]);

  const fetchMemories = async () => {
    try {
      setLoading(true);

      // Fetch memory summary
      const { data: summaryData } = await supabase
        .from("memory_summary")
        .select("summary_text, last_updated")
        .eq("user_id", session?.user?.id)
        .single();

      // Fetch recent memories
      const { data: memoriesData } = await supabase
        .from("user_memories")
        .select(
          "memory_type, key, value, confidence_score, created_at, updated_at"
        )
        .eq("user_id", session?.user?.id)
        .or("expires_at.is.null,expires_at.gt.now()")
        .order("updated_at", { ascending: false })
        .limit(20);

      setMemorySummary(summaryData);
      setMemories(memoriesData || []);
    } catch (error) {
      console.error("Error fetching memories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearMemories = () => {
    Alert.alert(
      "Clear All Memories",
      "Are you sure you want to delete all your memories? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: clearAllMemories,
        },
      ]
    );
  };

  const clearAllMemories = async () => {
    try {
      // Delete all memories for the user
      const { error: memoriesError } = await supabase
        .from("user_memories")
        .delete()
        .eq("user_id", session?.user?.id);

      if (memoriesError) throw memoriesError;

      // Delete memory summary
      const { error: summaryError } = await supabase
        .from("memory_summary")
        .delete()
        .eq("user_id", session?.user?.id);

      if (summaryError) throw summaryError;

      // Refresh the data
      await fetchMemories();
    } catch (error) {
      console.error("Error clearing memories:", error);
      Alert.alert("Error", "Failed to clear memories. Please try again.");
    }
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

  const hasMemories = memories.length > 0 || memorySummary?.summary_text;

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Memories</Text>
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
            <>
              {/* Memory Summary */}
              {memorySummary?.summary_text && (
                <View style={styles.memorySection}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Memory Summary</Text>
                    <Text style={styles.summaryText}>
                      {memorySummary.summary_text}
                    </Text>
                  </View>
                </View>
              )}

              {/* Individual Memories */}
              {memories.length > 0 && (
                <View style={styles.memorySection}>
                  {memories.map((memory, index) => (
                    <View key={index} style={styles.memoryCard}>
                      <View style={styles.memoryHeader}>
                        <Text style={styles.memoryType}>
                          {getMemoryTypeDisplayName(memory.memory_type)}
                        </Text>
                        <Ionicons
                          name={getMemoryTypeIcon(memory.memory_type) as any}
                          size={16}
                          color="#4A90E2"
                        />
                      </View>
                      <Text style={styles.memoryKey}>{memory.key}</Text>
                      <Text style={styles.memoryValue}>{memory.value}</Text>
                      {memory.confidence_score > 0 && (
                        <Text style={styles.memoryConfidence}>
                          Confidence:{" "}
                          {Math.round(memory.confidence_score * 100)}%
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Clear Memories Button */}
              <TouchableOpacity
                style={styles.clearMemoriesButton}
                onPress={handleClearMemories}
                activeOpacity={0.7}
              >
                <Text style={styles.clearMemoriesButtonText}>
                  Clear All Memories
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Bottom padding */}
          <View style={{ height: responsivePadding(40) }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
