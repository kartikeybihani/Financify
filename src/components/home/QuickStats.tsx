// components/home/QuickStats.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
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
  onToggleAccounts?: () => void;
  isAccountsExpanded?: boolean;
}

export const QuickStats: React.FC<QuickStatsProps> = React.memo(
  ({
    totalBalance,
    spendingData,
    formatCurrency,
    isLoading = false,
    onToggleAccounts,
    isAccountsExpanded = false,
  }) => {
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
      const slideWidth = screenWidth - 40; // Account for card padding
      const slideIndex = Math.round(
        event.nativeEvent.contentOffset.x / slideWidth
      );
      setActiveSlide(slideIndex);
    };

    // Check if we should show budget slide
    const hasBudget = insight?.type === "budget_progress";
    const totalSlides = hasBudget ? 2 : 1;

    // Render budget progress slide
    const renderBudgetSlide = () => {
      if (!hasBudget || !insight.budgetProgress) return null;

      const { spent, total, percentage, remaining, daysLeft } =
        insight.budgetProgress;
      const isOverBudget = percentage > 100;
      const isWarning = percentage > 80;
      const statusColor = isOverBudget
        ? "#FF6B6B"
        : isWarning
        ? "#FFB84D"
        : "#4ECDC4";

      return (
        <TouchableOpacity
          style={[
            styles.carouselSlide,
            { width: screenWidth - 40, paddingTop: 18, paddingBottom: 18 },
          ]}
          activeOpacity={0.8}
          onPress={() => router.push("/(tabs)/insights")}
        >
          {/* Top Row: Label on left, Status badge on right */}
          <View style={styles.netWorthHeaderRow}>
            <Text style={styles.netWorthLabel}>BUDGET PROGRESS</Text>
            <View
              style={[
                styles.netWorthTrendBadge,
                {
                  backgroundColor: `${statusColor}20`,
                  borderColor: `${statusColor}40`,
                  borderWidth: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.netWorthTrendBadgeText,
                  {
                    color: statusColor,
                  },
                ]}
              >
                {formatPercentage(percentage)}%
              </Text>
            </View>
          </View>

          {/* Main Amount - Left Aligned */}
          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "700",
                  color: "#fff",
                  letterSpacing: -0.5,
                }}
              >
                {formatCurrency(spent, "USD", {
                  decimals: 0,
                  useKM: false,
                })}
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "500",
                  color: "#888",
                  marginLeft: 8,
                }}
              >
                / {formatCurrency(total, "USD", { decimals: 0, useKM: false })}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View
            style={{
              marginBottom: 12,
              width: "100%",
            }}
          >
            <View
              style={{
                height: 6,
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                borderRadius: 3,
                overflow: "hidden",
                width: "100%",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: statusColor,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>

          {/* Bottom Info - Left to Right */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            {/* Left: Status Text */}
            <Text
              style={{
                color: statusColor,
                fontSize: 13,
                fontWeight: "600",
                letterSpacing: 0.2,
              }}
            >
              {isOverBudget
                ? "Over budget"
                : remaining > 0
                ? `${formatPercentage(percentage)}% spent`
                : "On track"}
            </Text>

            {/* Right: Remaining/Over Info */}
            {remaining > 0 ? (
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: "600",
                    marginBottom: 2,
                  }}
                >
                  {formatCurrency(remaining, "USD", {
                    decimals: 0,
                    useKM: false,
                  })}{" "}
                  left
                </Text>
                <Text
                  style={{
                    color: "#888",
                    fontSize: 11,
                    fontWeight: "400",
                  }}
                >
                  {daysLeft} days
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: "#FF6B6B",
                    fontSize: 13,
                    fontWeight: "600",
                    marginBottom: 2,
                  }}
                >
                  Over by{" "}
                  {formatCurrency(Math.abs(remaining), "USD", {
                    decimals: 0,
                    useKM: false,
                  })}
                </Text>
                <Text
                  style={{
                    color: "#888",
                    fontSize: 11,
                    fontWeight: "400",
                  }}
                >
                  {daysLeft} days left
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
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
          {/* Net Worth Slide */}
          <View
            style={[
              styles.carouselSlide,
              { width: screenWidth - 40, paddingTop: 18, paddingBottom: 18 },
            ]}
          >
            {/* Label */}
            <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>

            {/* Amount Row: Amount on left, Trend badge on right */}
            <View style={styles.netWorthAmountRow}>
              <Text style={styles.netWorthText}>
                {formatCurrency(totalBalance, "USD", {
                  decimals: 2,
                  useKM: false,
                })}
              </Text>
              <View style={styles.netWorthTrendBadge}>
                {isValid(spendingData.netWorthChange) &&
                spendingData.netWorthChange >= 0 ? (
                  <Ionicons name="trending-up" size={12} color="#4ECDC4" />
                ) : (
                  <Ionicons name="trending-down" size={12} color="#FF6B6B" />
                )}
                <Text
                  style={[
                    styles.netWorthTrendBadgeText,
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
                  {formatPercentage(spendingData.netWorthChange)}%
                </Text>
              </View>
            </View>
          </View>

          {/* Budget Progress Slide */}
          {renderBudgetSlide()}
        </ScrollView>

        {/* Carousel Dots */}
        {totalSlides > 1 && (
          <View style={styles.carouselDots}>
            {Array.from({ length: totalSlides }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.carouselDot,
                  activeSlide === index && styles.carouselDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Accounts Toggle Chip */}
        {onToggleAccounts && (
          <TouchableOpacity
            onPress={onToggleAccounts}
            activeOpacity={0.7}
            style={styles.accountsToggleChip}
          >
            <Text style={styles.accountsToggleChipText}>
              Tap to view your accounts.
            </Text>
            <Ionicons
              name={isAccountsExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color="#888"
              style={{ marginLeft: 5 }}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  }
);

QuickStats.displayName = "QuickStats";
