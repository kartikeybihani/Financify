import React, { useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  DeviceEventEmitter,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { QuickStatsSkeleton } from "@/src/components/home/LoadingSkeletons";
import { styles } from "@/src/styles/homeStyles";
import { useHomeInsights } from "@/src/hooks/useHomeInsights";
import { AnimatedNumber } from "@/src/components/shared/AnimatedNumber";
import {
  BudgetProgressData,
  loadBudgetProgressFromCache,
} from "@/src/shared/utils/homeScreenCache";
import { getUserIdSync } from "@/src/utils/insights/cacheUtils";

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
  isLoading?: boolean;
  onToggleAccounts?: () => void;
  isAccountsExpanded?: boolean;
  initialBudgetProgress?: {
    budgetProgress: BudgetProgressData | null;
    hasBudget: boolean;
  } | null;
}

export const QuickStats: React.FC<QuickStatsProps> = React.memo(
  ({
    totalBalance,
    spendingData,
    formatCurrency: _formatCurrency,
    isLoading = false,
    onToggleAccounts,
    isAccountsExpanded = false,
    initialBudgetProgress,
  }) => {
    const router = useRouter();
    const { insight, loading: insightsLoading } = useHomeInsights();

    const fallbackBudgetRef = useRef<{
      budgetProgress: BudgetProgressData | null;
      hasBudget: boolean;
    } | null>(
      !initialBudgetProgress
        ? (() => {
            try {
              const userId = getUserIdSync();
              if (!userId) return null;
              return loadBudgetProgressFromCache(userId);
            } catch {
              return null;
            }
          })()
        : null,
    );

    const effectiveBudgetData = useMemo(() => {
      if (insight?.type === "budget_progress" && insight.budgetProgress) {
        return insight.budgetProgress;
      }
      if (
        initialBudgetProgress?.hasBudget &&
        initialBudgetProgress.budgetProgress
      ) {
        return initialBudgetProgress.budgetProgress;
      }
      if (
        fallbackBudgetRef.current?.hasBudget &&
        fallbackBudgetRef.current.budgetProgress
      ) {
        return fallbackBudgetRef.current.budgetProgress;
      }
      return null;
    }, [insight, initialBudgetProgress]);

    const hasBudget = effectiveBudgetData !== null;

    const hasNoData =
      totalBalance === 0 &&
      spendingData.lastMonth === 0 &&
      spendingData.threeMonths === 0 &&
      !hasBudget;
    const shouldShowSkeleton = isLoading && insightsLoading && hasNoData;

    if (shouldShowSkeleton) {
      return <QuickStatsSkeleton />;
    }

    const handleBudgetPress = () => {
      router.push("/(tabs)/insights");
      setTimeout(() => {
        DeviceEventEmitter.emit("navigateToInsightsSection", {
          section: "budget",
        });
      }, 200);
    };

    const budgetData = effectiveBudgetData;
    const percentage = budgetData?.percentage || 0;
    const remaining = budgetData?.remaining || 0;
    const daysLeft = budgetData?.daysLeft || 0;
    const isOverBudget = percentage > 100;
    const isWarning = percentage > 90;
    const statusColor = isOverBudget
      ? "#FF6B6B"
      : isWarning
        ? "#D7A84B"
        : "#3FBF66";
    const statusIcon = isOverBudget
      ? "alert-circle-outline"
      : isWarning
        ? "warning-outline"
        : "wallet-outline";
    const statusLabel = isOverBudget
      ? "Over budget"
      : isWarning
        ? "Needs attention"
        : "Safe to spend";
    const daysLeftLabel =
      daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
    const budgetActionLabel = hasBudget ? "Budget" : "Set Up";

    return (
      <View style={styles.netWorthCard}>
        <View style={localStyles.cardHeaderRow}>
          <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
          {onToggleAccounts && (
            <TouchableOpacity
              onPress={onToggleAccounts}
              activeOpacity={0.7}
              style={localStyles.accountsInlineLink}
            >
              <Text style={localStyles.accountsInlineText}>Accounts</Text>
              <Ionicons
                name={isAccountsExpanded ? "chevron-up" : "chevron-down"}
                size={13}
                color="#8FA7C9"
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          )}
        </View>
        <AnimatedNumber
          value={totalBalance}
          prefix="$"
          decimals={2}
          duration={300}
          style={styles.netWorthText}
        />

        <View style={localStyles.budgetSnapshot}>
          <View style={localStyles.budgetSnapshotRow}>
            <View style={localStyles.budgetSnapshotMain}>
              {hasBudget ? (
                <>
                  <View style={localStyles.budgetStatusRow}>
                    <Ionicons name={statusIcon} size={12} color={statusColor} />
                    <Text
                      numberOfLines={1}
                      style={localStyles.budgetStatusLine}
                    >
                      <Text
                        style={[localStyles.budgetStatusLabel, { color: statusColor }]}
                      >
                        {statusLabel}
                      </Text>
                      {daysLeft > 0 && (
                        <Text style={localStyles.budgetStatusMeta}>
                          {" | ("}
                          {daysLeftLabel}
                          {")"}
                        </Text>
                      )}
                    </Text>
                  </View>
                  <AnimatedNumber
                    value={
                      isOverBudget
                        ? Math.abs(remaining)
                        : Math.max(0, remaining)
                    }
                    prefix={isOverBudget ? "-$" : "$"}
                    decimals={0}
                    duration={300}
                    style={[
                      localStyles.budgetSnapshotAmount,
                      { color: isOverBudget ? "#FF6B6B" : "#fff" },
                    ]}
                  />
                </>
              ) : (
                <>
                  <Text style={localStyles.budgetStatusLabel}>
                    No budget yet
                  </Text>
                  <Text style={localStyles.budgetHint}>
                    Set one to get daily spend guidance.
                  </Text>
                </>
              )}
            </View>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handleBudgetPress}
              style={[
                localStyles.inlineBudgetLink,
                hasBudget && localStyles.inlineBudgetLinkCompact,
              ]}
            >
              <Text style={localStyles.inlineBudgetLinkText}>
                {budgetActionLabel}
              </Text>
              <Ionicons name="chevron-forward" size={13} color="#CFE0FF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  },
);

const localStyles = StyleSheet.create({
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: -3,
  },
  accountsInlineLink: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(143, 167, 201, 0.22)",
    backgroundColor: "rgba(143, 167, 201, 0.1)",
  },
  accountsInlineText: {
    color: "#8FA7C9",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  budgetSnapshot: {
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  budgetSnapshotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  budgetSnapshotMain: {
    flex: 1,
    minWidth: 0,
  },
  budgetStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  budgetStatusLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  budgetStatusLine: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: "rgba(255, 255, 255, 0.7)",
    flexShrink: 1,
  },
  budgetStatusMeta: {
    color: "rgba(255, 255, 255, 0.62)",
    fontWeight: "500",
  },
  budgetSnapshotAmount: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  budgetHint: {
    marginTop: 1,
    fontSize: 9,
    color: "rgba(255, 255, 255, 0.65)",
    lineHeight: 12,
  },
  inlineBudgetLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(74, 144, 226, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.36)",
  },
  inlineBudgetLinkCompact: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineBudgetLinkText: {
    color: "#CFE0FF",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
});

QuickStats.displayName = "QuickStats";
