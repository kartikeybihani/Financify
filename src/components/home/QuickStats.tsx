// components/home/QuickStats.tsx

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  DeviceEventEmitter,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { QuickStatsSkeleton } from "@/src/components/home/LoadingSkeletons";
import { styles } from "@/src/styles/homeStyles";
import { useHomeInsights } from "@/src/hooks/useHomeInsights";
import { AppStorage } from "@/src/utils/storage/storage";

const QUICK_STATS_CAROUSEL_SLIDE_KEY = "quickStats_activeCarouselSlide";

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
    const scrollViewRef = useRef<ScrollView>(null);
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

    // Check if we should show budget slide
    const hasBudget = insight?.type === "budget_progress";
    const totalSlides = hasBudget ? 2 : 1;
    const slideWidth = screenWidth - 40;

    const handleScroll = (event: any) => {
      const slideIndex = Math.round(
        event.nativeEvent.contentOffset.x / slideWidth
      );
      setActiveSlide(slideIndex);
      if (totalSlides > 1) {
        AppStorage.setItemSync(
          QUICK_STATS_CAROUSEL_SLIDE_KEY,
          String(slideIndex)
        );
      }
    };

    // Restore saved carousel slide on mount
    useEffect(() => {
      if (totalSlides <= 1) return;
      const saved = AppStorage.getItemSync(QUICK_STATS_CAROUSEL_SLIDE_KEY);
      const savedIndex = saved ? parseInt(saved, 10) : 0;
      const clampedIndex = Math.min(
        Math.max(0, isNaN(savedIndex) ? 0 : savedIndex),
        totalSlides - 1
      );
      if (clampedIndex > 0) {
        setActiveSlide(clampedIndex);
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({
            x: clampedIndex * slideWidth,
            animated: false,
          });
        });
      }
    }, [totalSlides, slideWidth]);

    const handleBudgetPress = () => {
      router.push("/(tabs)/insights");
      setTimeout(() => {
        DeviceEventEmitter.emit("navigateToInsightsSection", {
          section: "budget",
        });
      }, 200);
    };

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
            {
              width: screenWidth - 40,
              paddingTop: 16,
              paddingBottom: 16,
            },
          ]}
          activeOpacity={0.8}
          onPress={handleBudgetPress}
        >
          {/* Label */}
          <Text style={[styles.netWorthLabel, { marginBottom: 8 }]}>
            BUDGET PROGRESS
          </Text>

          {/* Amount Row: spent/total on left, chip and remaining on right */}
          <View style={[styles.netWorthAmountRow, { marginBottom: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text
                style={{
                  fontSize: 22,
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
                  fontSize: 16,
                  fontWeight: "500",
                  color: "#888",
                  marginLeft: 6,
                }}
              >
                / {formatCurrency(total, "USD", { decimals: 0, useKM: false })}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={[
                  styles.netWorthTrendBadge,
                  {
                    backgroundColor: `${statusColor}20`,
                    borderColor: `${statusColor}40`,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.netWorthTrendBadgeText,
                    { color: statusColor, fontSize: 12 },
                  ]}
                >
                  {formatPercentage(percentage)}%
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: isOverBudget ? "#FF6B6B" : "#fff",
                }}
              >
                {isOverBudget
                  ? `-${formatCurrency(Math.abs(remaining), "USD", {
                      decimals: 0,
                      useKM: false,
                    })}`
                  : formatCurrency(Math.max(0, remaining), "USD", {
                      decimals: 0,
                      useKM: false,
                    })}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={{ width: "100%" }}>
            <View
              style={{
                height: 5,
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
        </TouchableOpacity>
      );
    };

    return (
      <View style={[styles.netWorthCard, { padding: 0 }]}>
        <ScrollView
          ref={scrollViewRef}
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
              {
                width: screenWidth - 40,
                paddingTop: 18,
                paddingBottom: 18,
              },
            ]}
          >
            {hasBudget && insight.budgetProgress ? (
              /* Redesigned layout with Safe to Spend when budget exists */
              (() => {
                const { remaining, percentage, daysLeft } =
                  insight.budgetProgress;
                const isOverBudget = percentage > 100;
                const isWarning = percentage > 80;
                const statusColor = isOverBudget
                  ? "#FF6B6B"
                  : isWarning
                  ? "#FFB84D"
                  : "#4ECDC4";
                const safeToSpend = Math.max(0, remaining);

                return (
                  <View
                    style={{
                      flexDirection: "row",
                      width: "100%",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    {/* Left: Net Worth */}
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={[
                          styles.netWorthLabel,
                          { marginBottom: 8, textAlign: "center" },
                        ]}
                      >
                        TOTAL NET WORTH
                      </Text>
                      <Text
                        style={[
                          styles.netWorthText,
                          { textAlign: "center", flex: 0 },
                        ]}
                      >
                        {formatCurrency(totalBalance, "USD", {
                          decimals: 2,
                          useKM: false,
                        })}
                      </Text>
                    </View>

                    {/* Divider */}
                    <View
                      style={{
                        width: 1,
                        height: 50,
                        backgroundColor: "rgba(255, 255, 255, 0.1)",
                      }}
                    />

                    {/* Right: Safe to Spend */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handleBudgetPress}
                      style={{
                        alignItems: "center",
                        minWidth: 140,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 6,
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name={
                            isOverBudget
                              ? "alert-circle-outline"
                              : isWarning
                              ? "warning-outline"
                              : "wallet-outline"
                          }
                          size={14}
                          color={statusColor}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            color: statusColor,
                            fontWeight: "600",
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                          }}
                        >
                          {isOverBudget ? "Over Budget" : "Safe to Spend"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: "700",
                          color: isOverBudget ? "#FF6B6B" : "#fff",
                          letterSpacing: -0.5,
                          marginBottom: 2,
                          textAlign: "center",
                          marginTop: 1,
                        }}
                      >
                        {isOverBudget
                          ? `-${formatCurrency(Math.abs(remaining), "USD", {
                              decimals: 0,
                              useKM: false,
                            })}`
                          : formatCurrency(safeToSpend, "USD", {
                              decimals: 0,
                              useKM: false,
                            })}
                      </Text>
                      {daysLeft > 0 && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#888",
                            fontWeight: "500",
                            textAlign: "center",
                          }}
                        >
                          {daysLeft} days left
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })()
            ) : (
              /* Default left-aligned layout */
              <>
                <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
                <Text style={styles.netWorthText}>
                  {formatCurrency(totalBalance, "USD", {
                    decimals: 2,
                    useKM: false,
                  })}
                </Text>
              </>
            )}
          </View>

          {/* Budget Progress Slide */}
          {renderBudgetSlide()}
        </ScrollView>

        {/* Carousel Dots */}
        {totalSlides > 1 && (
          <View
            style={[styles.carouselDots, { paddingTop: 4, paddingBottom: 10 }]}
          >
            {Array.from({ length: totalSlides }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.carouselDot,
                  {
                    width: 5,
                    height: 5,
                    borderRadius: 2.5,
                  },
                  activeSlide === index && {
                    ...styles.carouselDotActive,
                    height: 5,
                    borderRadius: 2.5,
                  },
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
