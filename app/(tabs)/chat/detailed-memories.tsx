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
import { LinearGradient } from "expo-linear-gradient";
import { Dimensions } from "react-native";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import EditMemoryModal from "@/src/components/modals/EditMemoryModal";
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

interface DetailedMemoriesScreenProps {
  onBack?: () => void;
}

export default function DetailedMemoriesScreen({
  onBack,
}: DetailedMemoriesScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuthNavigation();

  const [profileMemories, setProfileMemories] = useState<any[]>([]);
  const [loadingProfileMemories, setLoadingProfileMemories] = useState(true);
  const [editingProfileMemory, setEditingProfileMemory] = useState<any | null>(
    null
  );
  const [editProfileMemoryText, setEditProfileMemoryText] = useState("");
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [updatingMemoryId, setUpdatingMemoryId] = useState<string | null>(null);

  // Fetch profile memories when component mounts
  useEffect(() => {
    if (session?.user?.id) {
      fetchProfileMemories();
    }
  }, [session]);

  const fetchProfileMemories = async () => {
    try {
      setLoadingProfileMemories(true);
      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      const response = await authenticatedFetch(
        `${BASE_URL}/api/memory?type=profile`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch profile memories: ${response.statusText}`
        );
      }

      const data = await response.json();
      const memories = data.results || data.memories || [];

      // Sort by date (newest first)
      memories.sort((a: any, b: any) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      setProfileMemories(memories);
    } catch (error) {
      console.error("Error fetching profile memories:", error);
      Alert.alert("Error", "Failed to load memories. Please try again.");
      setProfileMemories([]);
    } finally {
      setLoadingProfileMemories(false);
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

  // Edit profile memory
  const handleEditProfileMemory = (memory: any) => {
    setEditingProfileMemory(memory);
    const memoryText = memory.memory || memory.content || "";
    setEditProfileMemoryText(memoryText);
  };

  const handleCancelEditProfileMemory = () => {
    setEditingProfileMemory(null);
    setEditProfileMemoryText("");
  };

  const handleSaveEditProfileMemory = async () => {
    if (!editingProfileMemory || !editProfileMemoryText.trim()) {
      Alert.alert("Error", "Memory text cannot be empty");
      return;
    }

    try {
      setUpdatingMemoryId(editingProfileMemory.id);
      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      const documentId =
        editingProfileMemory.documents?.[0]?.id || editingProfileMemory.id;
      const memoryId = editingProfileMemory.id;

      const response = await authenticatedFetch(`${BASE_URL}/api/memory`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memoryId: memoryId,
          documentId: documentId,
          content: editProfileMemoryText.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(errorData.error || "Failed to update memory");
      }

      // Update local state
      setProfileMemories((prev) =>
        prev.map((m) =>
          m.id === editingProfileMemory.id
            ? { ...m, memory: editProfileMemoryText.trim() }
            : m
        )
      );

      setEditingProfileMemory(null);
      setEditProfileMemoryText("");
      Alert.alert("Success", "Memory updated successfully");
    } catch (error: any) {
      console.error("Error updating profile memory:", error);
      Alert.alert("Error", error?.message || "Failed to update memory");
    } finally {
      setUpdatingMemoryId(null);
    }
  };

  // Delete profile memory
  const handleDeleteProfileMemory = (memoryId: string) => {
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
          onPress: () => deleteProfileMemory(memoryId),
        },
      ]
    );
  };

  const deleteProfileMemory = async (memoryId: string) => {
    // Capture original list and the specific memory before making optimistic update
    const originalMemories = [...profileMemories];
    const memoryToDelete = originalMemories.find((m) => m.id === memoryId);
    const documentId = memoryToDelete?.documents?.[0]?.id || memoryId;

    try {
      setDeletingMemoryId(memoryId);
      // Optimistic update
      setProfileMemories((prev) => prev.filter((m) => m.id !== memoryId));

      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      const queryParams = new URLSearchParams({
        memoryId,
        documentId: documentId,
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(errorData.error || "Failed to delete memory");
      }

      console.log(`Profile memory deleted successfully: ${memoryId}`);

      // Refresh the entire list to account for any cascade deletions
      // (e.g., if deleting a memory linked to a document also deletes other memories linked to that document)
      await fetchProfileMemories();
    } catch (error: any) {
      console.error("Error deleting profile memory:", error);
      // Restore original state on error using the snapshot captured before deletion
      setProfileMemories(originalMemories);
      Alert.alert("Error", error.message || "Failed to delete memory");
    } finally {
      setDeletingMemoryId(null);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onBack}
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
          <Text style={styles.headerTitle}>All Memories</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loadingProfileMemories ? (
            <FinnyLoadingIndicator message="Loading detailed memories..." />
          ) : profileMemories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyDescription}>
                Didn't found specific memories yet.
              </Text>
            </View>
          ) : (
            <View style={styles.memoriesList}>
              {profileMemories.map((memory, index) => (
                <View key={memory.id || index} style={styles.profileMemoryCard}>
                  <View style={styles.profileMemoryHeader}>
                    <View style={styles.profileMemoryLeft}>
                      <Text style={styles.dateLabel}>
                        {formatDate(
                          memory.updatedAt ||
                            memory.documents?.[0]?.updatedAt ||
                            memory.documents?.[0]?.createdAt ||
                            new Date().toISOString()
                        )}
                      </Text>
                      {/* Show document title if available */}
                      {/* {memory.documents?.[0]?.title && (
                        <Text style={styles.profileMemoryTitle}>
                          {memory.documents[0].title}
                        </Text>
                      )} */}
                      {/* Show the memory text (main content) */}
                      <Text style={styles.profileMemoryText}>
                        {memory.memory || ""}
                      </Text>
                      {/* Show document summary if available and different from memory */}
                      {memory.documents?.[0]?.summary &&
                        memory.documents[0].summary !== memory.memory && (
                          <Text
                            style={[
                              styles.profileMemoryText,
                              {
                                fontSize: responsiveFontSize(11),
                                color: "rgba(255, 255, 255, 0.6)",
                                marginTop: responsivePadding(4),
                                fontStyle: "italic" as const,
                              },
                            ]}
                          >
                            {memory.documents[0].summary}
                          </Text>
                        )}
                    </View>
                    <View style={styles.profileMemoryRight}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => handleEditProfileMemory(memory)}
                        activeOpacity={0.7}
                        disabled={deletingMemoryId === memory.id}
                      >
                        <Ionicons
                          name="create-outline"
                          size={22}
                          color="#4A90E2"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.trashButton}
                        onPress={() => handleDeleteProfileMemory(memory.id)}
                        activeOpacity={0.7}
                        disabled={
                          deletingMemoryId === memory.id ||
                          updatingMemoryId === memory.id
                        }
                      >
                        {deletingMemoryId === memory.id ? (
                          <ActivityIndicator size="small" color="#FF4444" />
                        ) : (
                          <Ionicons
                            name="trash-outline"
                            size={22}
                            color="#FF4444"
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Bottom padding */}
          <View style={{ height: responsivePadding(60) + insets.bottom }} />
        </ScrollView>

        {/* Edit Profile Memory Modal */}
        <EditMemoryModal
          visible={editingProfileMemory !== null}
          editText={editProfileMemoryText}
          onTextChange={setEditProfileMemoryText}
          onSave={handleSaveEditProfileMemory}
          onCancel={handleCancelEditProfileMemory}
          isSaving={updatingMemoryId !== null}
        />
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
    minHeight: screenHeight * 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(32),
    minHeight: screenHeight * 0.5,
  },
  emptyDescription: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center" as const,
    lineHeight: responsiveFontSize(20),
  },
  memoriesList: {
    marginBottom: responsivePadding(24),
  },
  dateLabel: {
    fontSize: responsiveFontSize(10),
    color: "rgba(255, 255, 255, 0.55)",
    marginBottom: responsivePadding(8),
    fontWeight: "500" as const,
    letterSpacing: 0.2,
  },
  profileMemoryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingVertical: responsivePadding(12),
    paddingHorizontal: responsivePadding(14),
    marginBottom: responsivePadding(12),
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  profileMemoryHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
  },
  profileMemoryLeft: {
    flex: 1,
    marginRight: responsivePadding(12),
  },
  profileMemoryRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  editButton: {
    padding: 8,
  },
  trashButton: {
    padding: 8,
  },
  profileMemoryTitle: {
    fontSize: responsiveFontSize(15),
    fontWeight: "600" as const,
    color: "#fff",
    marginBottom: responsivePadding(4),
  },
  profileMemoryText: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.85)",
    lineHeight: responsiveFontSize(18),
  },
};
