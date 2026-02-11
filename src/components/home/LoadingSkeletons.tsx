// components/home/LoadingSkeletons.tsx

import React, { useEffect, useRef } from "react";
import { View, Dimensions, Animated } from "react-native";
import { LoadingSkeleton, ShimmerView } from "@/src/components/LoadingSkeleton";
import { styles } from "@/src/styles/homeStyles";

const screenWidth = Dimensions.get("window").width;

// Wrapper that animates the whole box with a subtle pulse
const AnimatedBox: React.FC<{
  children: React.ReactNode;
  style?: object | object[];
}> = ({ children, style }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const animatedStyle = {
    opacity: pulse,
  };

  return (
    <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
  );
};

// Skeleton for QuickStats carousel
export const QuickStatsSkeleton: React.FC = React.memo(() => (
  <AnimatedBox style={[styles.netWorthCard, { padding: 0 }]}>
    <View style={[styles.carouselSlide, { width: screenWidth - 40 }]}>
      <ShimmerView
        width={100}
        height={16}
        borderRadius={4}
        style={{ marginBottom: 20 }}
      />
      <View style={styles.spendingContainer}>
        <View style={styles.spendingColumn}>
          <ShimmerView
            width={120}
            height={12}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <ShimmerView
            width={80}
            height={24}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <ShimmerView width={100} height={14} borderRadius={4} />
        </View>
        <View style={styles.spendingDivider} />
        <View style={styles.spendingColumn}>
          <ShimmerView
            width={80}
            height={12}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <ShimmerView
            width={60}
            height={24}
            borderRadius={4}
            style={{ marginBottom: 8 }}
          />
          <ShimmerView width={90} height={14} borderRadius={4} />
        </View>
      </View>
    </View>
    <View style={styles.carouselDots}>
      <View style={[styles.carouselDot, { opacity: 0.3 }]} />
      <View style={[styles.carouselDot, { opacity: 0.3 }]} />
    </View>
  </AnimatedBox>
));

// Skeleton for Financial Cards
export const FinancialCardsSkeleton: React.FC = React.memo(() => (
  <View style={styles.summaryRow}>
    {[1, 2, 3].map((index) => (
      <AnimatedBox key={index} style={styles.financialCardSkeleton}>
        <ShimmerView
          width={60}
          height={12}
          borderRadius={4}
          style={{ marginBottom: 8 }}
        />
        <ShimmerView
          width={80}
          height={20}
          borderRadius={4}
          style={{ marginBottom: 8 }}
        />
        <ShimmerView width={30} height={30} borderRadius={15} />
      </AnimatedBox>
    ))}
  </View>
));

// Skeleton for Goals Section
export const GoalsSectionSkeleton: React.FC = React.memo(() => (
  <View style={styles.goalsSection}>
    <View style={styles.goalsSectionHeader}>
      <View style={styles.goalsTitleContainer}>
        <ShimmerView width={20} height={20} borderRadius={10} />
        <ShimmerView
          width={100}
          height={16}
          borderRadius={4}
          style={{ marginLeft: 8 }}
        />
      </View>
      <ShimmerView width={80} height={14} borderRadius={4} />
    </View>
    <AnimatedBox style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <ShimmerView
          width={120}
          height={16}
          borderRadius={4}
          style={{ marginBottom: 4 }}
        />
        <ShimmerView width={180} height={14} borderRadius={4} />
      </View>
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: "45%" }]}>
          <ShimmerView width="100%" height={6} borderRadius={3} />
        </View>
      </View>
      <View style={styles.goalPercentContainer}>
        <ShimmerView width={14} height={14} borderRadius={7} />
        <ShimmerView
          width={60}
          height={12}
          borderRadius={4}
          style={{ marginLeft: 2 }}
        />
      </View>
    </AnimatedBox>
  </View>
));

// Skeleton for Finny Message
export const FinnyMessageSkeleton: React.FC = React.memo(() => (
  <View style={styles.finnyMessageContainer}>
    <AnimatedBox style={styles.finnyMessage}>
      <View style={styles.finnyIconContainer}>
        <ShimmerView width={45} height={50} borderRadius={20} />
      </View>
      <View style={styles.finnyMessageContent}>
        <ShimmerView
          width={100}
          height={16}
          borderRadius={4}
          style={{ marginBottom: 4 }}
        />
        <ShimmerView width={200} height={14} borderRadius={4} />
      </View>
    </AnimatedBox>
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
        <ShimmerView width={24} height={24} borderRadius={12} />
        <View style={styles.headerTextContainer}>
          <ShimmerView
            width={120}
            height={18}
            borderRadius={4}
            style={{ marginBottom: 4 }}
          />
          <ShimmerView width={80} height={14} borderRadius={4} />
        </View>
      </View>

      {/* Content Skeleton */}
      <View style={styles.container}>
        <FinnyMessageSkeleton />
        <QuickStatsSkeleton />
        <FinancialCardsSkeleton />
        <GoalsSectionSkeleton />
        <ShimmerView
          width={200}
          height={40}
          borderRadius={20}
          style={{ alignSelf: "center", marginTop: 20 }}
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
