import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Animated } from "react-native";

interface LoadingSkeletonProps {
  count?: number;
  height?: number;
  style?: any;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  count = 3,
  height = 60,
  style,
}) => {
  return (
    <View style={[styles.skeletonContainer, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.skeletonItem, { height }]} />
      ))}
    </View>
  );
};

interface LoadingIndicatorProps {
  message?: string;
  size?: "small" | "large";
  color?: string;
  style?: any;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = "Loading...",
  size = "large",
  color = "#4A90E2",
  style,
}) => {
  return (
    <View style={[styles.loadingContainer, style]}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.loadingText}>{message}</Text>}
    </View>
  );
};

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: any;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = "Something went wrong",
  onRetry,
  icon = "warning-outline",
  style,
}) => {
  return (
    <View style={[styles.errorContainer, style]}>
      <Ionicons name={icon} size={48} color="#FF6B6B" />
      <Text style={styles.errorTitle}>Oops!</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color="#4A90E2" />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionText?: string;
  onAction?: () => void;
  style?: any;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No data found",
  message = "There's nothing to show here yet",
  icon = "document-outline",
  actionText,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.emptyContainer, style]}>
      <Ionicons name={icon} size={48} color="#888" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionText && onAction && (
        <TouchableOpacity style={styles.actionButton} onPress={onAction}>
          <Text style={styles.actionButtonText}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface RefreshStatusProps {
  message: string;
  type?: "success" | "error" | "loading" | "info";
  style?: any;
}

export const RefreshStatus: React.FC<RefreshStatusProps> = ({
  message,
  type = "info",
  style,
}) => {
  const getIcon = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "close-circle";
      case "loading":
        return "hourglass";
      default:
        return "information-circle";
    }
  };

  const getColor = () => {
    switch (type) {
      case "success":
        return "#4CAF50";
      case "error":
        return "#FF6B6B";
      case "loading":
        return "#4A90E2";
      default:
        return "#888";
    }
  };

  return (
    <View style={[styles.refreshStatusContainer, style]}>
      <Ionicons name={getIcon()} size={16} color={getColor()} />
      <Text style={[styles.refreshStatusText, { color: getColor() }]}>
        {message}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonContainer: {
    padding: 16,
  },
  skeletonItem: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    marginBottom: 12,
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginTop: 12,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4A90E2",
  },
  retryButtonText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginTop: 12,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  refreshStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  refreshStatusText: {
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 6,
  },
});
