// components/home/QuickStats.tsx

import React, { useState } from "react";
import { View, Text, ScrollView, Dimensions, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { QuickStatsSkeleton } from "@/src/components/home/LoadingSkeletons";
import { styles } from "@/src/styles/homeStyles";
import { useHomeInsights } from "@/src/hooks/useHomeInsights";

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
    const router = useRouter();
    const { insight, loading: insightsLoading } = useHomeInsights();
    const [activeSlide, setActiveSlide] = useState(0);
    const screenWidth = Dimensions.get("window").width;
    
    // Show skeleton if loading AND balance is zero (no cached data)
    const hasNoData =
      totalBalance === 0 &&
      spendingData.lastMonth === 0 &&
      spendingData.threeMonths === 0;
    const shouldShowSkeleton = (isLoading || insightsLoading) && hasNoData;

    if (shouldShowSkeleton) {
      return <QuickStatsSkeleton />;
    }

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

    // Render insight slide based on type
    const renderInsightSlide = () => {
      if (!insight) {
        // Fallback: Show current month spending
        return (
          <View style={[styles.carouselSlide, { width: screenWidth - 40 }]}>
            <Text style={styles.netWorthLabel}>THIS MONTH</Text>
            <Text style={styles.spendingAmount}>
              {formatCurrency(spendingData.lastMonth, "USD", {
                decimals: 0,
                useKM: true,
              })}
            </Text>
            <Text style={[styles.netWorthTrendText, { marginTop: 8, fontSize: 12 }]}>
              Where did it go?
            </Text>
          </View>
        );
      }

      switch (insight.type) {
        case "budget_progress": {
          const { spent, total, percentage, remaining, daysLeft } =
            insight.budgetProgress!;
          const isOverBudget = percentage > 100;
          const isWarning = percentage > 80;

          return (
            <TouchableOpacity
              style={[styles.carouselSlide, { width: screenWidth - 40 }]}
              activeOpacity={0.8}
              onPress={() => router.push("/insights")}
            >
              <Text style={styles.netWorthLabel}>BUDGET PROGRESS</Text>
              <View style={{ marginTop: 8 }}>
                <Text style={styles.spendingAmount}>
                  {formatCurrency(spent, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                  <Text style={{ fontSize: 18, color: "#888" }}>
                    {" "}
                    / {formatCurrency(total, "USD", { decimals: 0, useKM: true })}
                  </Text>
                </Text>
                <View style={{ marginTop: 12 }}>
                  {/* Progress bar */}
                  <View
                    style={{
                      height: 6,
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${Math.min(percentage, 100)}%`,
                        backgroundColor: isOverBudget
                          ? "#FF6B6B"
                          : isWarning
                          ? "#FFB84D"
                          : "#4ECDC4",
                        borderRadius: 3,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 8,
                    }}
                  >
                    <Text
                      style={[
                        styles.netWorthTrendText,
                        {
                          color: isOverBudget
                            ? "#FF6B6B"
                            : isWarning
                            ? "#FFB84D"
                            : "#4ECDC4",
                          fontSize: 14,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {formatPercentage(percentage)}% spent
                    </Text>
                    {remaining > 0 && (
                      <Text
                        style={[
                          styles.netWorthTrendText,
                          { fontSize: 12, color: "#888" },
                        ]}
                      >
                        {formatCurrency(remaining, "USD", {
                          decimals: 0,
                          useKM: true,
                        })}{" "}
                        left • {daysLeft} days
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }

        case "category_alert": {
          const { category, amount, percentage, color } = insight.categoryAlert!;

          return (
            <TouchableOpacity
              style={[styles.carouselSlide, { width: screenWidth - 40 }]}
              activeOpacity={0.8}
              onPress={() => router.push("/insights")}
            >
              <Text style={styles.netWorthLabel}>SPENDING ALERT</Text>
              <View style={{ marginTop: 8 }}>
                <Text
                  style={[
                    styles.spendingAmount,
                    { fontSize: 20, marginBottom: 4 },
                  ]}
                >
                  {category}
                </Text>
                <Text style={styles.spendingAmount}>
                  {formatCurrency(amount, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                </Text>
                <View
                  style={[
                    styles.netWorthTrend,
                    {
                      backgroundColor: `${color}20`,
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: `${color}40`,
                    },
                  ]}
                >
                  <Ionicons name="alert-circle" size={16} color={color} />
                  <Text
                    style={[
                      styles.netWorthTrendText,
                      { color, marginLeft: 6 },
                    ]}
                  >
                    {formatPercentage(percentage)}% of spending
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }

        case "spending_summary": {
          const { totalSpent, daysInMonth, currentDay } =
            insight.spendingSummary!;
          const projectedSpending =
            (totalSpent / currentDay) * daysInMonth;

          return (
            <TouchableOpacity
              style={[styles.carouselSlide, { width: screenWidth - 40 }]}
              activeOpacity={0.8}
              onPress={() => router.push("/insights")}
            >
              <Text style={styles.netWorthLabel}>THIS MONTH</Text>
              <Text style={styles.spendingAmount}>
                {formatCurrency(totalSpent, "USD", {
                  decimals: 0,
                  useKM: true,
                })}
              </Text>
              <View style={{ marginTop: 8 }}>
                <Text
                  style={[
                    styles.netWorthTrendText,
                    { fontSize: 12, color: "#888" },
                  ]}
                >
                  Day {currentDay} of {daysInMonth}
                </Text>
                <Text
                  style={[
                    styles.netWorthTrendText,
                    { fontSize: 12, color: "#888", marginTop: 4 },
                  ]}
                >
                  On track:{" "}
                  {formatCurrency(projectedSpending, "USD", {
                    decimals: 0,
                    useKM: true,
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }

        default:
          return null;
      }
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
          {/* Insight Slide (Budget Progress / Category Alert / Spending Summary) */}
          {renderInsightSlide()}

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
