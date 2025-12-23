// components/home/FinnyMessage.tsx

import React, { useMemo } from "react";
import { View, Text, Image } from "react-native";
import { styles } from "@/src/styles/homeStyles";
import { Goal } from "@/src/types/finny";
import { SpendingData } from "@/src/hooks/useSpendingData";

interface FinnyMessageProps {
  goals?: Goal[];
  spendingData?: SpendingData;
  totalBalance?: number;
  investmentsTotal?: number;
  liabilitiesTotal?: number;
  netWorthChange?: number;
}

export const FinnyMessage: React.FC<FinnyMessageProps> = React.memo(
  ({
    goals = [],
    spendingData,
    totalBalance = 0,
    investmentsTotal = 0,
    liabilitiesTotal = 0,
    netWorthChange = 0,
  }) => {
    // Generate context-aware, compelling tips
    const getContextualTip = useMemo(() => {
      const activeGoals = goals.filter(
        (goal) =>
          goal.status !== "completed" &&
          !(goal.target_amount > 0 && goal.current_amount >= goal.target_amount)
      );

      // Net worth is growing significantly
      if (netWorthChange > 5) {
        return `Net worth up ${netWorthChange.toFixed(1)}% this month! 🚀`;
      }

      // Spending decreased significantly
      if (spendingData && spendingData.lastMonthChange < -10) {
        return `Spent ${Math.abs(spendingData.lastMonthChange).toFixed(
          0
        )}% less last month. Smart moves!`;
      }

      // Spending increased significantly
      if (spendingData && spendingData.lastMonthChange > 15) {
        return `Spending up ${spendingData.lastMonthChange.toFixed(
          0
        )}% - time to review subscriptions? 📊`;
      }

      // Has active goals with good progress
      if (activeGoals.length > 0) {
        const closestGoal = activeGoals.reduce((closest, goal) => {
          if (!closest) return goal;
          const closestProgress =
            closest.target_amount > 0
              ? closest.current_amount / closest.target_amount
              : 0;
          const goalProgress =
            goal.target_amount > 0
              ? goal.current_amount / goal.target_amount
              : 0;
          return goalProgress > closestProgress ? goal : closest;
        }, null as Goal | null);

        if (closestGoal) {
          const progress =
            closestGoal.target_amount > 0
              ? (closestGoal.current_amount / closestGoal.target_amount) * 100
              : 0;
          if (progress > 50 && progress < 90) {
            return `You're ${progress.toFixed(
              0
            )}% to your goal! Almost there 🎯`;
          }
        }
      }

      // Has investments
      if (investmentsTotal > 0 && investmentsTotal > totalBalance * 0.2) {
        return `Your investments are working for you. Compound magic! ✨`;
      }

      // Has high liabilities
      if (liabilitiesTotal > 0 && liabilitiesTotal > totalBalance * 0.3) {
        return `Paying down debt builds wealth faster than you think 💪`;
      }

      // Net worth positive but small change
      if (netWorthChange > 0 && netWorthChange < 5) {
        return `Steady growth beats quick wins. Keep it up! 📈`;
      }

      // No goals set
      if (goals.length === 0 && totalBalance > 0) {
        return `Set a goal and watch your money grow faster 🎯`;
      }

      // Default compelling tips
      const defaultTips = [
        `Every dollar saved today is $2 tomorrow 🕐`,
        `Small consistent actions > big sporadic ones 📊`,
        `Your future self is watching. Make them proud 👀`,
        `Compound interest is the 8th wonder. Use it! 🧮`,
        `Track it, optimize it, own it 💎`,
        `Financial freedom isn't free, but it's worth it 🗽`,
        `Progress > perfection. Keep moving forward 🚶`,
        `Your net worth = your network + your habits 🌐`,
      ];

      return defaultTips[Math.floor(Math.random() * defaultTips.length)];
    }, [
      goals,
      spendingData,
      totalBalance,
      investmentsTotal,
      liabilitiesTotal,
      netWorthChange,
    ]);

    return (
      <View style={styles.finnyMessageContainer}>
        <View style={styles.finnyMessage}>
          <View style={styles.finnyIconContainer}>
            <Image
              source={require("../../../assets/images/finny2.png")}
              style={{
                width: 55,
                height: 70,
                borderRadius: 20,
                resizeMode: "contain",
              }}
            />
          </View>
          <View style={styles.finnyMessageContent}>
            <Text style={styles.finnyMessageTitle}>Daily Progress</Text>
            <Text style={styles.finnyMessageText}>{getContextualTip}</Text>
          </View>
        </View>
      </View>
    );
  }
);

FinnyMessage.displayName = "FinnyMessage";
