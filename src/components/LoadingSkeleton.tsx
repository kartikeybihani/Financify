import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";

const { width: screenWidth } = Dimensions.get("window");

// Shimmer animation component
const ShimmerView = ({
  width,
  height,
  borderRadius = 8,
  style = {},
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}) => {
  const shimmerAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startShimmer = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerAnimation, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    };

    startShimmer();
  }, []);

  const opacity = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "#2A2A2A",
          opacity,
        },
        style,
      ]}
    />
  );
};

// Header skeleton
const HeaderSkeleton = () => (
  <View style={styles.header}>
    <View style={styles.headerIconContainer}>
      <ShimmerView width={24} height={24} borderRadius={12} />
    </View>
    <View style={styles.headerTextContainer}>
      <ShimmerView
        width={120}
        height={18}
        borderRadius={4}
        style={{ marginBottom: 4 }}
      />
      <ShimmerView width={100} height={14} borderRadius={4} />
    </View>
  </View>
);

// Finny message skeleton
const FinnyMessageSkeleton = () => (
  <View style={styles.finnyMessageContainer}>
    <View style={styles.finnyMessage}>
      <View style={styles.finnyIconContainer}>
        <ShimmerView width={45} height={45} borderRadius={20} />
      </View>
      <View style={styles.finnyMessageContent}>
        <ShimmerView
          width={100}
          height={16}
          borderRadius={4}
          style={{ marginBottom: 6 }}
        />
        <ShimmerView width={180} height={14} borderRadius={4} />
      </View>
    </View>
  </View>
);

// Net worth card skeleton
const NetWorthSkeleton = () => (
  <View style={styles.netWorthCard}>
    <View style={styles.netWorthContent}>
      <ShimmerView
        width={80}
        height={12}
        borderRadius={4}
        style={{ marginBottom: 8 }}
      />
      <ShimmerView
        width={150}
        height={32}
        borderRadius={4}
        style={{ marginBottom: 8 }}
      />
      <View style={styles.trendContainer}>
        <ShimmerView width={16} height={16} borderRadius={8} />
        <ShimmerView
          width={100}
          height={12}
          borderRadius={4}
          style={{ marginLeft: 8 }}
        />
      </View>
    </View>
    <View style={styles.carouselDots}>
      {[0, 1].map((index) => (
        <ShimmerView
          key={index}
          width={8}
          height={8}
          borderRadius={4}
          style={{ marginHorizontal: 4 }}
        />
      ))}
    </View>
  </View>
);

// Financial card skeleton
const FinancialCardSkeleton = ({ title }: { title: string }) => (
  <View style={styles.financialCard}>
    <View style={styles.financialCardHeader}>
      <ShimmerView width={20} height={20} borderRadius={10} />
      <ShimmerView
        width={60}
        height={12}
        borderRadius={4}
        style={{ marginLeft: 8 }}
      />
    </View>
    <ShimmerView
      width={80}
      height={20}
      borderRadius={4}
      style={{ marginTop: 12 }}
    />
  </View>
);

// Goal card skeleton
const GoalSkeleton = () => (
  <View style={styles.goalCard}>
    <View style={styles.goalHeader}>
      <View style={styles.goalsTitleContainer}>
        <ShimmerView width={20} height={20} borderRadius={10} />
        <ShimmerView
          width={100}
          height={16}
          borderRadius={4}
          style={{ marginLeft: 8 }}
        />
      </View>
      <ShimmerView width={80} height={12} borderRadius={4} />
    </View>
    <View style={styles.goalContent}>
      <ShimmerView
        width={120}
        height={18}
        borderRadius={4}
        style={{ marginBottom: 8 }}
      />
      <ShimmerView
        width={180}
        height={14}
        borderRadius={4}
        style={{ marginBottom: 16 }}
      />
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: "60%" }]}>
          <ShimmerView width="100%" height={6} borderRadius={3} />
        </View>
      </View>
      <View style={styles.progressInfo}>
        <ShimmerView width={16} height={16} borderRadius={8} />
        <ShimmerView
          width={100}
          height={12}
          borderRadius={4}
          style={{ marginLeft: 8 }}
        />
      </View>
    </View>
  </View>
);

// Main loading skeleton component
export const LoadingSkeleton = ({
  showError = false,
  onRetry,
}: {
  showError?: boolean;
  onRetry?: () => void;
}) => {
  if (showError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <HeaderSkeleton />
        <View style={styles.errorContainer}>
          <View style={styles.errorContent}>
            <Ionicons name="cloud-offline-outline" size={64} color="#666" />
            <Text style={styles.errorTitle}>Connection Issue</Text>
            <Text style={styles.errorDescription}>
              We're having trouble loading your financial data. Please check
              your connection and try again.
            </Text>
            {onRetry && (
              <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <HeaderSkeleton />

      <View style={styles.container}>
        <FinnyMessageSkeleton />
        <NetWorthSkeleton />

        {/* Summary cards skeleton */}
        <View style={styles.summaryRow}>
          <FinancialCardSkeleton title="Accounts" />
          <FinancialCardSkeleton title="Investments" />
          <FinancialCardSkeleton title="Liabilities" />
        </View>

        {/* Goal skeleton */}
        <GoalSkeleton />

        {/* Add account button skeleton */}
        <View style={styles.addAccountButton}>
          <ShimmerView width={160} height={16} borderRadius={4} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#1A1A1A",
  },
  headerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  finnyMessageContainer: {
    marginBottom: 20,
  },
  finnyMessage: {
    flexDirection: "row",
    backgroundColor: "#2A2A2A",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  finnyIconContainer: {
    marginRight: 12,
  },
  finnyMessageContent: {
    flex: 1,
  },
  netWorthCard: {
    backgroundColor: "#2A2A2A",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  netWorthContent: {
    alignItems: "center",
    paddingBottom: 16,
  },
  trendContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  carouselDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  financialCard: {
    flex: 1,
    backgroundColor: "#2A2A2A",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#333",
  },
  financialCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  goalCard: {
    backgroundColor: "#2A2A2A",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  goalsTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  goalContent: {
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: "#333",
    borderRadius: 3,
    marginBottom: 12,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  progressInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  addAccountButton: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorContent: {
    alignItems: "center",
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 20,
    marginBottom: 12,
  },
  errorDescription: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
