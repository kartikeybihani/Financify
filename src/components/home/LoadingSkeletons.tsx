// components/home/LoadingSkeletons.tsx

import React from "react";
import { View, Dimensions } from "react-native";
import { LoadingSkeleton } from "@/src/components/LoadingSkeleton";
import { styles } from "@/src/styles/homeStyles";

const screenWidth = Dimensions.get("window").width;

// Skeleton for QuickStats carousel
export const QuickStatsSkeleton: React.FC = React.memo(() => (
  <View style={[styles.netWorthCard, { padding: 0 }]}>
    <View style={[styles.carouselSlide, { width: screenWidth - 40 }]}>
      <View
        style={[
          styles.skeletonText,
          { width: 100, height: 16, marginBottom: 20 },
        ]}
      />
      <View style={styles.spendingContainer}>
        <View style={styles.spendingColumn}>
          <View
            style={[
              styles.skeletonText,
              { width: 120, height: 12, marginBottom: 8 },
            ]}
          />
          <View
            style={[
              styles.skeletonText,
              { width: 80, height: 24, marginBottom: 8 },
            ]}
          />
          <View style={[styles.skeletonText, { width: 100, height: 14 }]} />
        </View>
        <View style={styles.spendingDivider} />
        <View style={styles.spendingColumn}>
          <View
            style={[
              styles.skeletonText,
              { width: 80, height: 12, marginBottom: 8 },
            ]}
          />
          <View
            style={[
              styles.skeletonText,
              { width: 60, height: 24, marginBottom: 8 },
            ]}
          />
          <View style={[styles.skeletonText, { width: 90, height: 14 }]} />
        </View>
      </View>
    </View>
    <View style={styles.carouselDots}>
      <View style={[styles.carouselDot, { opacity: 0.3 }]} />
      <View style={[styles.carouselDot, { opacity: 0.3 }]} />
    </View>
  </View>
));

// Skeleton for Financial Cards
export const FinancialCardsSkeleton: React.FC = React.memo(() => (
  <View style={styles.summaryRow}>
    {[1, 2, 3].map((index) => (
      <View key={index} style={styles.financialCardSkeleton}>
        <View
          style={[
            styles.skeletonText,
            { width: 60, height: 12, marginBottom: 8 },
          ]}
        />
        <View
          style={[
            styles.skeletonText,
            { width: 80, height: 20, marginBottom: 8 },
          ]}
        />
        <View
          style={[
            styles.skeletonText,
            { width: 30, height: 30, borderRadius: 15 },
          ]}
        />
      </View>
    ))}
  </View>
));

// Skeleton for Goals Section
export const GoalsSectionSkeleton: React.FC = React.memo(() => (
  <View style={styles.goalsSection}>
    <View style={styles.goalsSectionHeader}>
      <View style={styles.goalsTitleContainer}>
        <View
          style={[
            styles.skeletonText,
            { width: 20, height: 20, borderRadius: 10 },
          ]}
        />
        <View
          style={[
            styles.skeletonText,
            { width: 100, height: 16, marginLeft: 8 },
          ]}
        />
      </View>
      <View style={[styles.skeletonText, { width: 80, height: 14 }]} />
    </View>
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View
          style={[
            styles.skeletonText,
            { width: 120, height: 16, marginBottom: 4 },
          ]}
        />
        <View style={[styles.skeletonText, { width: 180, height: 14 }]} />
      </View>
      <View style={styles.progressBarBackground}>
        <View
          style={[styles.progressBarFill, { width: "45%", opacity: 0.3 }]}
        />
      </View>
      <View style={styles.goalPercentContainer}>
        <View
          style={[
            styles.skeletonText,
            { width: 14, height: 14, borderRadius: 7 },
          ]}
        />
        <View
          style={[
            styles.skeletonText,
            { width: 60, height: 12, marginLeft: 2 },
          ]}
        />
      </View>
    </View>
  </View>
));

// Skeleton for Finny Message
export const FinnyMessageSkeleton: React.FC = React.memo(() => (
  <View style={styles.finnyMessageContainer}>
    <View style={styles.finnyMessage}>
      <View style={styles.finnyIconContainer}>
        <View
          style={[
            styles.skeletonText,
            { width: 45, height: 50, borderRadius: 20 },
          ]}
        />
      </View>
      <View style={styles.finnyMessageContent}>
        <View
          style={[
            styles.skeletonText,
            { width: 100, height: 16, marginBottom: 4 },
          ]}
        />
        <View style={[styles.skeletonText, { width: 200, height: 14 }]} />
      </View>
    </View>
  </View>
));

// Main loading skeleton for the entire home screen
export const HomeScreenSkeleton: React.FC<{
  showError?: boolean;
  onRetry?: () => void;
}> = React.memo(({ showError = false, onRetry }) => {
  if (showError) {
    return <LoadingSkeleton showError={true} onRetry={onRetry} />;
  }

  return (
    <View style={styles.safeArea}>
      {/* Header Skeleton */}
      <View style={styles.header}>
        <View
          style={[
            styles.skeletonText,
            { width: 24, height: 24, borderRadius: 12 },
          ]}
        />
        <View style={styles.headerTextContainer}>
          <View
            style={[
              styles.skeletonText,
              { width: 120, height: 18, marginBottom: 4 },
            ]}
          />
          <View style={[styles.skeletonText, { width: 80, height: 14 }]} />
        </View>
      </View>

      {/* Content Skeleton */}
      <View style={styles.container}>
        <FinnyMessageSkeleton />
        <QuickStatsSkeleton />
        <FinancialCardsSkeleton />
        <GoalsSectionSkeleton />
        <View
          style={[
            styles.skeletonText,
            {
              width: 200,
              height: 40,
              borderRadius: 20,
              alignSelf: "center",
              marginTop: 20,
            },
          ]}
        />
      </View>
    </View>
  );
});

QuickStatsSkeleton.displayName = "QuickStatsSkeleton";
FinancialCardsSkeleton.displayName = "FinancialCardsSkeleton";
GoalsSectionSkeleton.displayName = "GoalsSectionSkeleton";
FinnyMessageSkeleton.displayName = "FinnyMessageSkeleton";
HomeScreenSkeleton.displayName = "HomeScreenSkeleton";
