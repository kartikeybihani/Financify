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
  Image,
  ImageStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";
import { useChatContext } from "@/src/contexts/ChatContext";
import { supabase } from "@/src/lib/supabase/supabase";
import { ChatSession } from "@/src/types/chatHistory";
import FinnyLoadingIndicator from "@/src/components/shared/FinnyLoadingIndicator";
import ChatScreenHeader from "@/src/components/shared/ChatScreenHeader";
import logger from "@/src/utils/core/logger";

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
  emptyState: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(40),
  },
  emptyStateIcon: {
    marginBottom: responsivePadding(16),
  },
  emptyStateImageCircle: {
    width: screenWidth * 0.45,
    height: screenWidth * 0.45,
    borderRadius: (screenWidth * 0.45) / 2,
    overflow: "hidden" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: responsivePadding(16),
  },
  emptyStateImage: {
    width: "100%",
    height: "100%",
  } as ImageStyle,
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
  // Use first_message as preview (messages not loaded for performance)
  // Full messages will be loaded when user opens the session
  const previewText = session.first_message
    ? `${session.first_message.substring(0, 60)}${
        session.first_message.length > 60 ? "..." : ""
      }`
    : "No preview available";

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
          {formatRelativeTime(session.updated_at || session.created_at)}
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
  onSessionSelected?: () => void;
}

export default function ChatHistoryScreen({
  onBack,
  onSessionSelected,
}: ChatHistoryScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const { session, isLoading: isAuthLoading } = useAuthNavigation();
  const { loadSession } = useChatContext();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    // Don't fetch if auth is still loading
    if (isAuthLoading) {
      logger.debug("[History] Auth still loading, waiting...");
      return;
    }

    try {
      if (!session?.user?.id) {
        logger.debug("[History] No session or user ID available");
        setError("Not authenticated");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      logger.debug("[History] Fetching sessions for user:", session.user.id);

      // Query directly from table - don't load messages JSONB for list view (too slow)
      // Messages will be loaded when user opens a specific session
      const { data, error: fetchError } = await supabase
        .from("chat_sessions")
        .select("id, session_title, first_message, created_at, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(30);

      if (fetchError) {
        console.error("[History] Error fetching sessions:", fetchError);
        throw fetchError;
      }

      const filteredSessions = (data || []).filter((session: any) => {
        if (!session?.created_at || !session?.updated_at) {
          return false;
        }
        return (
          new Date(session.updated_at).getTime() >
          new Date(session.created_at).getTime()
        );
      });

      logger.debug("[History] Fetched sessions:", filteredSessions.length);
      // Show only sessions that have at least one saved Finny reply.
      const mappedSessions: ChatSession[] = filteredSessions.map(
        (session: any) => ({
          id: session.id,
          session_title: session.session_title,
          first_message: session.first_message,
          created_at: session.created_at,
          updated_at: session.updated_at,
        }),
      );
      setSessions(mappedSessions);
      setError(null);
    } catch (err: any) {
      console.error("[History] Error fetching sessions:", err);
      const errorMessage =
        err?.message || err?.error_description || "Failed to load chat history";
      setError(errorMessage);
      setSessions([]); // Clear sessions on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user?.id, isAuthLoading]);

  useEffect(() => {
    // Only fetch when auth is not loading
    if (!isAuthLoading) {
      fetchSessions();
    } else {
      // If auth is loading, keep loading state true
      setLoading(true);
    }
  }, [fetchSessions, isAuthLoading]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSessions();
  }, [fetchSessions]);

  const handleSessionPress = async (sessionId: string) => {
    try {
      await loadSession(sessionId);
      onSessionSelected?.();
    } catch (err) {
      logger.error("Error loading session:", err);
      Alert.alert("Error", "Failed to load chat session");
    }
  };

  const renderSession = ({ item }: { item: ChatSession }) => (
    <HistoryCard session={item} onPress={() => handleSessionPress(item.id)} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateImageCircle}>
        <Image
          source={require("../../../assets/images/thinking2.png")}
          style={styles.emptyStateImage}
          resizeMode="cover"
        />
      </View>
      <Text style={styles.emptyStateTitle}>No chat history yet</Text>
      <Text style={styles.emptyStateDescription}>
        Start chatting with Finny to see your conversation history here. Your
        last 30 completed chats will be saved automatically.
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
    <FinnyLoadingIndicator
      message="Loading chat history..."
      imageSource={require("../../../assets/images/thinking2.png")}
    />
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
        {/* Header */}
        <ChatScreenHeader title="Chat History" onBack={onBack} />

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
