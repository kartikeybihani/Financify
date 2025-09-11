import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  SafeAreaView,
} from "react-native";

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
            duration: 1200,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerAnimation, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: false,
          }),
        ])
      ).start();
    };

    startShimmer();
  }, [shimmerAnimation]);

  const opacity = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
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

// Category grid skeleton
const CategoryGridSkeleton = () => (
  <View style={styles.categoryGridContainer}>
    <ShimmerView
      width={200}
      height={18}
      borderRadius={4}
      style={styles.sectionTitle}
    />

    {/* Total spending card skeleton */}
    <View style={styles.totalSpendingCard}>
      <ShimmerView
        width={100}
        height={14}
        borderRadius={4}
        style={{ marginBottom: 8 }}
      />
      <ShimmerView
        width={180}
        height={32}
        borderRadius={4}
        style={{ marginBottom: 6 }}
      />
      <ShimmerView width={80} height={12} borderRadius={4} />
    </View>

    {/* Category grid items */}
    <View style={styles.categoryGrid}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={styles.categoryGridItem}>
          <View style={styles.categoryGridHeader}>
            <ShimmerView width={36} height={36} borderRadius={18} />
            <ShimmerView width={40} height={16} borderRadius={4} />
          </View>
          <ShimmerView
            width={100}
            height={16}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <ShimmerView
            width={80}
            height={12}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <View style={styles.miniProgressBar}>
            <ShimmerView width="70%" height={4} borderRadius={2} />
          </View>
        </View>
      ))}
    </View>
  </View>
);

// Recurring transactions card skeleton
const RecurringTransactionsSkeleton = () => (
  <View style={styles.recurringCard}>
    <View style={styles.recurringHeader}>
      <ShimmerView width={36} height={36} borderRadius={18} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <ShimmerView
          width={160}
          height={18}
          borderRadius={4}
          style={{ marginBottom: 6 }}
        />
        <ShimmerView width={120} height={14} borderRadius={4} />
      </View>
      <ShimmerView width={60} height={12} borderRadius={4} />
    </View>

    {/* Recurring items */}
    <View style={styles.recurringContent}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.recurringItem}>
          <View style={styles.recurringItemLeft}>
            <ShimmerView width={28} height={28} borderRadius={14} />
            <View style={{ marginLeft: 10 }}>
              <ShimmerView
                width={100}
                height={14}
                borderRadius={4}
                style={{ marginBottom: 4 }}
              />
              <ShimmerView width={80} height={12} borderRadius={4} />
            </View>
          </View>
          <ShimmerView width={60} height={16} borderRadius={4} />
        </View>
      ))}
    </View>

    <View style={styles.recurringFooter}>
      <ShimmerView width={120} height={14} borderRadius={4} />
    </View>
  </View>
);

// Transaction list skeleton
const TransactionListSkeleton = () => (
  <View style={styles.transactionsContainer}>
    <View style={styles.transactionsHeader}>
      <ShimmerView width={120} height={18} borderRadius={4} />
      <View style={styles.headerButtons}>
        <ShimmerView width={24} height={24} borderRadius={8} />
        <ShimmerView width={140} height={32} borderRadius={12} />
      </View>
    </View>

    {/* Transaction count info */}
    <View style={styles.transactionInfo}>
      <ShimmerView width={180} height={14} borderRadius={4} />
    </View>

    {/* Transaction items */}
    {[0, 1, 2, 3, 4, 5].map((index) => (
      <View key={index} style={styles.transactionItem}>
        <View style={styles.transactionInfo}>
          <ShimmerView
            width={160}
            height={16}
            borderRadius={4}
            style={{ marginBottom: 6 }}
          />
          <ShimmerView
            width={100}
            height={12}
            borderRadius={4}
            style={{ marginBottom: 4 }}
          />
          <ShimmerView width={80} height={11} borderRadius={4} />
        </View>
        <View style={styles.transactionRight}>
          <ShimmerView
            width={80}
            height={16}
            borderRadius={4}
            style={{ marginBottom: 4 }}
          />
          <ShimmerView width={16} height={16} borderRadius={8} />
        </View>
      </View>
    ))}
  </View>
);

// Main insights loading skeleton
export const InsightsLoadingSkeleton = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <CategoryGridSkeleton />
        <RecurringTransactionsSkeleton />
        <TransactionListSkeleton />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    marginBottom: 16,
  },

  // Category Grid Styles
  categoryGridContainer: {
    marginBottom: 32,
  },
  totalSpendingCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  categoryGridItem: {
    width: "48%",
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
  },
  categoryGridHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  miniProgressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },

  // Recurring Transactions Styles
  recurringCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
  },
  recurringHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  recurringContent: {
    marginBottom: 16,
  },
  recurringItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  recurringItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  recurringFooter: {
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },

  // Transactions List Styles
  transactionsContainer: {
    flex: 1,
  },
  transactionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  transactionInfo: {
    backgroundColor: "#16213E",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  transactionRight: {
    alignItems: "flex-end",
    gap: 4,
  },
});

export default InsightsLoadingSkeleton;
