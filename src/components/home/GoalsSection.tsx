// components/home/GoalsSection.tsx

import React from "react";
import { View, Text, TouchableOpacity, Image, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Goal } from "@/src/types/finny";
import { styles } from "@/src/styles/homeStyles";
import logger from "@/src/utils/core/logger";

interface GoalsSectionProps {
  goals: Goal[];
  closestGoal: Goal | null;
  formatCurrency: (amount: number, currency?: string, options?: any) => string;
  isInitialLoad?: boolean; // Prevent empty state flash during initial load
}

export const GoalsSection: React.FC<GoalsSectionProps> = React.memo(
  ({ goals, closestGoal, formatCurrency, isInitialLoad = false }) => {
    const router = useRouter();

    // Show empty state if no active goals or no closest goal
    // BUT only if we're not still loading initial data (prevents flash)
    if ((goals.length === 0 || !closestGoal) && !isInitialLoad) {
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
                  Journey begins by setting your first goal.
                </Text>
                {(() => {
                  const isIOS = Platform.OS === "ios";
                  const iosVersion = isIOS
                    ? parseInt(
                        String(Platform.Version).split(".")[0] || "0",
                        10,
                      )
                    : 0;
                  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;
                  const ButtonShell = shouldUseLiquidGlass ? GlassView : View;

                  return (
                    <TouchableOpacity
                      style={styles.addFirstGoalButton}
                      activeOpacity={0.9}
                      onPress={() => {
                        router.push({
                          pathname: "/goals",
                          params: { openAddGoal: "true" },
                        });
                      }}
                    >
                      {shouldUseLiquidGlass ? (
                        <ButtonShell
                          glassEffectStyle="regular"
                          tintColor="rgba(74, 144, 226, 0.8)"
                          style={styles.addFirstGoalGlassContainer}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.addFirstGoalText}>
                            Add Your First Goal
                          </Text>
                        </ButtonShell>
                      ) : (
                        <LinearGradient
                          colors={["#4A90E2", "#357ABD", "#2E6BA8"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.addFirstGoalGradientContainer}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.addFirstGoalText}>
                            Add Your First Goal
                          </Text>
                        </LinearGradient>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.goalsSection}>
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <View style={styles.goalsTitleContainer}>
              <Ionicons
                name="rocket"
                size={18}
                style={{ alignSelf: "center" }}
                color="#4A90E2"
              />
              <Text style={styles.sectionTitle}>Active Goal</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/goals")}
              style={styles.viewAllButton}
            >
              <Text style={styles.viewAllText}>View all goals</Text>
            </TouchableOpacity>
          </View>

          {closestGoal && (
            <TouchableOpacity onPress={() => router.push("/goals")}>
              <View style={styles.goalContentBox}>
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
                                100,
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
                        (closestGoal.current_amount /
                          closestGoal.target_amount) *
                          100,
                      )
                    : 0}
                  % Progress
                </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  },
);

GoalsSection.displayName = "GoalsSection";
