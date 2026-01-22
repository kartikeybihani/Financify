// components/home/QuickStats.tsx

import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QuickStatsSkeleton } from "@/src/components/home/LoadingSkeletons";
import { styles } from "@/src/styles/homeStyles";

interface QuickStatsProps {
  totalBalance: number;
  spendingData: {
    threeMonths: number;
    lastMonth: number;
    threeMonthsChange: number;
    lastMonthChange: number;
    netWorthChange: number;
  };
  formatCurrency: (amount: number, currency?: string, options?: any) => string;
  isLoading?: boolean; // Show skeleton when loading and no cached data
}

export const QuickStats: React.FC<QuickStatsProps> = React.memo(
  ({ totalBalance, spendingData, formatCurrency, isLoading = false }) => {
    // Show skeleton if loading AND balance is zero (no cached data)
    const hasNoData =
      totalBalance === 0 &&
      spendingData.lastMonth === 0 &&
      spendingData.threeMonths === 0;
    const shouldShowSkeleton = isLoading && hasNoData;

    if (shouldShowSkeleton) {
      return <QuickStatsSkeleton />;
    }
    const [activeSlide, setActiveSlide] = useState(0);
    const screenWidth = Dimensions.get("window").width;

    // Helper to safely format percentage changes
    const formatPercentage = (value: number): string => {
      if (isNaN(value) || !isFinite(value)) return "0.0";
      return value.toFixed(1);
    };

    // Helper to check if value is valid
    const isValid = (value: number): boolean => {
      return !isNaN(value) && isFinite(value);
    };

    const handleScroll = (event: any) => {
      const slideIndex = Math.round(
        event.nativeEvent.contentOffset.x / screenWidth,
      );
      setActiveSlide(slideIndex);
    };

    return (
      <View style={[styles.netWorthCard, { padding: 0 }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={{ width: screenWidth - 40 }}
        >
          {/* Spending Slide */}
          <View style={[styles.carouselSlide, { width: screenWidth - 40 }]}>
            <Text style={styles.netWorthLabel}>SPENDING</Text>
            <View style={styles.spendingContainer}>
              <View style={styles.spendingColumn}>
                <Text style={styles.spendingLabel}>LAST 3 MONTHS AVG</Text>
                <Text style={styles.spendingAmount}>
                  {formatCurrency(spendingData.threeMonths, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                </Text>
                <View style={styles.spendingTrend}>
                  {isValid(spendingData.threeMonthsChange) &&
                  spendingData.threeMonthsChange >= 0 ? (
                    <Ionicons name="trending-up" size={16} color="#FF6B6B" />
                  ) : (
                    <Ionicons name="trending-down" size={16} color="#4ECDC4" />
                  )}
                  <Text
                    style={[
                      styles.netWorthTrendText,
                      {
                        color:
                          isValid(spendingData.threeMonthsChange) &&
                          spendingData.threeMonthsChange >= 0
                            ? "#FF6B6B"
                            : "#4ECDC4",
                      },
                    ]}
                  >
                    {isValid(spendingData.threeMonthsChange) &&
                    spendingData.threeMonthsChange >= 0
                      ? "+"
                      : ""}
                    {formatPercentage(spendingData.threeMonthsChange)}% vs prev
                  </Text>
                </View>
              </View>
              <View style={styles.spendingDivider} />
              <View style={styles.spendingColumn}>
                <Text style={styles.spendingLabel}>LAST MONTH</Text>
                <Text style={styles.spendingAmount}>
                  {formatCurrency(spendingData.lastMonth, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                </Text>
                <View style={styles.spendingTrend}>
                  {isValid(spendingData.lastMonthChange) &&
                  spendingData.lastMonthChange >= 0 ? (
                    <Ionicons name="trending-up" size={16} color="#FF6B6B" />
                  ) : (
                    <Ionicons name="trending-down" size={16} color="#4ECDC4" />
                  )}
                  <Text
                    style={[
                      styles.netWorthTrendText,
                      {
                        color:
                          isValid(spendingData.lastMonthChange) &&
                          spendingData.lastMonthChange >= 0
                            ? "#FF6B6B"
                            : "#4ECDC4",
                      },
                    ]}
                  >
                    {isValid(spendingData.lastMonthChange) &&
                    spendingData.lastMonthChange >= 0
                      ? "+"
                      : ""}
                    {formatPercentage(spendingData.lastMonthChange)}% vs prev
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Net Worth Slide */}
          <View
            style={[
              styles.carouselSlide,
              { width: screenWidth - 40, paddingTop: 15 },
            ]}
          >
            <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
            <Text style={styles.netWorthText}>
              {formatCurrency(totalBalance, "USD", {
                decimals: 2,
                useKM: false,
              })}
            </Text>
            <View style={styles.netWorthTrend}>
              {isValid(spendingData.netWorthChange) &&
              spendingData.netWorthChange >= 0 ? (
                <Ionicons name="trending-up" size={16} color="#4ECDC4" />
              ) : (
                <Ionicons name="trending-down" size={16} color="#FF6B6B" />
              )}
              <Text
                style={[
                  styles.netWorthTrendText,
                  {
                    color:
                      isValid(spendingData.netWorthChange) &&
                      spendingData.netWorthChange >= 0
                        ? "#4ECDC4"
                        : "#FF6B6B",
                  },
                ]}
              >
                {isValid(spendingData.netWorthChange) &&
                spendingData.netWorthChange >= 0
                  ? "+"
                  : ""}
                {formatPercentage(spendingData.netWorthChange)}% this month
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Carousel Dots */}
        <View style={styles.carouselDots}>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={[
                styles.carouselDot,
                activeSlide === index && styles.carouselDotActive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  },
);

QuickStats.displayName = "QuickStats";
