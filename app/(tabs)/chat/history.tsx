import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  Animated,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";
import { useChatContext } from "@/src/contexts/ChatContext";
import { supabase } from "@/src/lib/supabase/supabase";
import { ChatSession } from "@/src/types/chatHistory";

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
    padding: 8,
  },
  backButtonCircle: {
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
  emptyState: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(40),
  },
  emptyStateIcon: {
    marginBottom: responsivePadding(16),
  },
  emptyStateTitle: {
    fontSize: responsiveFontSize(18),
    fontWeight: "600" as const,
    color: "#fff",
    marginBottom: responsivePadding(8),
    textAlign: "center" as const,
  },
  emptyStateDescription: {
    fontSize: responsiveFontSize(14),
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center" as const,
    lineHeight: responsiveFontSize(20),
  },
  sessionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: responsivePadding(10),
    marginBottom: responsivePadding(8),
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
  sessionHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    marginBottom: responsivePadding(6),
  },
  sessionTitle: {
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
    color: "#fff",
    flex: 1,
    marginRight: responsivePadding(8),
  },
  messageCount: {
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    paddingHorizontal: responsivePadding(8),
    paddingVertical: responsivePadding(4),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  messageCountText: {
    fontSize: responsiveFontSize(12),
    color: "#4A90E2",
    fontWeight: "600" as const,
  },
  sessionTime: {
    fontSize: responsiveFontSize(12),
    color: "rgba(255, 255, 255, 0.5)",
    fontWeight: "500" as const,
  },
  sessionPreview: {
    fontSize: responsiveFontSize(13),
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: responsiveFontSize(18),
    paddingRight: responsivePadding(45),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(40),
  },
  errorText: {
    fontSize: responsiveFontSize(14),
    color: "#FF4444",
    textAlign: "center" as const,
    marginBottom: responsivePadding(16),
  },
  retryButton: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    paddingHorizontal: responsivePadding(16),
    paddingVertical: responsivePadding(8),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  retryButtonText: {
    color: "#4A90E2",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
  },
};

// Format relative time
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString();
};

interface HistoryCardProps {
  session: ChatSession;
  onPress: () => void;
}

const HistoryCard: React.FC<HistoryCardProps> = ({ session, onPress }) => {
  // Get the last Finny message for preview
  const getLastFinnyMessage = (messages: any[]) => {
    if (!messages || !Array.isArray(messages)) {
      console.log("No messages array found in session:", session);
      return "";
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "finny") {
        return messages[i].text;
      }
    }
    return "";
  };

  const lastFinnyMessage = getLastFinnyMessage(session.messages || []);
  console.log("Session data:", {
    id: session.id,
    hasMessages: !!session.messages,
    messagesLength: session.messages?.length,
    lastFinnyMessage: lastFinnyMessage?.substring(0, 30) + "...",
  });

  const previewText = lastFinnyMessage
    ? `${lastFinnyMessage.substring(0, 60)}${
        lastFinnyMessage.length > 60 ? "..." : ""
      }`
    : session.first_message;

  return (
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {session.session_title}
        </Text>
        <Text style={styles.sessionTime}>
          {formatRelativeTime(session.created_at)}
        </Text>
      </View>
      <Text style={styles.sessionPreview} numberOfLines={3}>
        {previewText}
      </Text>
    </TouchableOpacity>
  );
};

interface ChatHistoryScreenProps {
  onBack?: () => void;
}

export default function ChatHistoryScreen({
  onBack,
}: ChatHistoryScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthNavigation();
  const { loadSession } = useChatContext();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const fetchSessions = useCallback(async () => {
    try {
      if (!session?.user?.id) {
        setError("Not authenticated");
        return;
      }

      const { data, error: fetchError } = await supabase.rpc(
        "get_user_chat_sessions",
        {
          p_user_id: session.user.id,
        }
      );

      if (fetchError) {
        throw fetchError;
      }

      console.log("Raw data from get_user_chat_sessions:", data);
      setSessions(data || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching sessions:", err);
      setError("Failed to load chat history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSessions();
  }, [fetchSessions]);

  const handleSessionPress = async (sessionId: string) => {
    try {
      await loadSession(sessionId);
      handleBack();
    } catch (err) {
      console.error("Error loading session:", err);
      Alert.alert("Error", "Failed to load chat session");
    }
  };

  const renderSession = ({ item }: { item: ChatSession }) => (
    <HistoryCard session={item} onPress={() => handleSessionPress(item.id)} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="chatbubbles-outline"
        size={64}
        color="rgba(255, 255, 255, 0.3)"
        style={styles.emptyStateIcon}
      />
      <Text style={styles.emptyStateTitle}>No chat history yet</Text>
      <Text style={styles.emptyStateDescription}>
        Start chatting with Finny to see your conversation history here. Your
        last 5 chats will be saved automatically.
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={fetchSessions}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#4A90E2" />
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
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
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chat History</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            renderLoading()
          ) : error ? (
            renderErrorState()
          ) : sessions.length === 0 ? (
            renderEmptyState()
          ) : (
            <FlatList
              data={sessions}
              renderItem={renderSession}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="#4A90E2"
                  colors={["#4A90E2"]}
                />
              }
              contentContainerStyle={{
                paddingBottom: responsivePadding(20),
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
