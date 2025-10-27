// components/home/GoalsSection.tsx

import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { Goal } from "@/src/types/finny";
import { styles } from "@/src/styles/homeStyles";

interface GoalsSectionProps {
  goals: Goal[];
  closestGoal: Goal | null;
  formatCurrency: (amount: number, currency?: string, options?: any) => string;
}

export const GoalsSection: React.FC<GoalsSectionProps> = React.memo(
  ({ goals, closestGoal, formatCurrency }) => {
    const router = useRouter();

    if (goals.length === 0) {
      return (
        <View style={styles.goalsSection}>
          <View style={styles.emptyGoalsContainer}>
            <View style={styles.emptyGoalsContent}>
              <View style={styles.emptyGoalsImageContainer}>
                <Image
                  source={require("../../../assets/images/mascot1.jpg")}
                  style={[
                    styles.emptyGoalsImage,
                    {
                      transform: [{ scaleX: -1 }, { rotate: "0deg" }],
                    },
                  ]}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.emptyGoalsTextContainer}>
                <Text style={styles.emptyGoalsTitle}>No Goals Yet</Text>
                <Text style={styles.emptyGoalsDescription}>
                  Start your financial journey by setting your first goal.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    router.push({
                      pathname: "/goals",
                      params: { openAddGoal: "true" },
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <GlassView
                    style={styles.addFirstGoalButton}
                    tintColor="#4A90E2"
                  >
                    <View style={styles.addFirstGoalContent}>
                      <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.addFirstGoalText}>
                        Add Your First Goal
                      </Text>
                    </View>
                  </GlassView>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.goalsSection}>
        <View style={styles.goalsSectionHeader}>
          <View style={styles.goalsTitleContainer}>
            <Ionicons name="trophy" size={20} color="#4A90E2" />
            <Text style={styles.sectionTitle}>Your Focus 🎯</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/goals")}
            style={styles.viewAllButton}
          >
            <Text style={styles.viewAllText}>View all goals</Text>
          </TouchableOpacity>
        </View>

        {closestGoal && (
          <View style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>{closestGoal.label}</Text>
              <Text style={styles.goalAmount}>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(closestGoal.current_amount || 0)}{" "}
                of{" "}
                {formatCurrency(closestGoal.target_amount || 0, "USD", {
                  decimals: 0,
                  useKM: true,
                })}
              </Text>
            </View>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${
                      closestGoal.target_amount > 0
                        ? Math.min(
                            (closestGoal.current_amount /
                              closestGoal.target_amount) *
                              100,
                            100
                          )
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
            <View style={styles.goalPercentContainer}>
              <Ionicons name="trending-up" size={14} color="#4ECDC4" />
              <Text
                style={{
                  fontWeight: "600",
                  color: "#4ECDC4",
                  fontSize: 12,
                  marginLeft: 2,
                }}
              >
                {closestGoal.target_amount > 0
                  ? Math.round(
                      (closestGoal.current_amount / closestGoal.target_amount) *
                        100
                    )
                  : 0}
                % Progress
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }
);

GoalsSection.displayName = "GoalsSection";
