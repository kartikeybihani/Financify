import React from "react";
import { View, Text, TouchableOpacity, Animated, Platform } from "react-native";
import { styles } from "@/src/styles/goalsStyles";
import { GoalItemProps } from "@/src/types/goalsTypes";
import {
  getCategoryEmoji,
  getCategoryColor,
  calculateProgressPercentage,
  formatGoalProgress,
  getProgressColor,
} from "@/src/utils/categories/goalCategories";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const GoalItem: React.FC<GoalItemProps> = ({
  item,
  index,
  animation,
  onPress,
}) => {
  const animatedStyle = {
    opacity: animation,
    transform: [
      {
        translateX: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [100, 0],
        }),
      },
    ],
  };

  const handlePress = () => {
    if (onPress) {
      onPress(item);
    }
  };

  const progressPercentage = calculateProgressPercentage(
    item.current_amount,
    item.target_amount
  );
  const isAchieved = progressPercentage >= 100;

  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;
  const ChipContainer = shouldUseLiquidGlass ? GlassView : View;

  return (
    <TouchableOpacity
      key={item.id}
      onPress={handlePress}
      style={styles.timelineRow}
      activeOpacity={0.7}
    >
      <View style={styles.timelineDot} />
      <View style={styles.timelineLine} />
      <Animated.View style={[styles.timelineContent, animatedStyle]}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineDateContainer}>
            <Text style={styles.timelineYear}>
              {new Date(item.target_date).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </Text>
            {isAchieved && (
              shouldUseLiquidGlass ? (
                <GlassView
                  glassEffectStyle="regular"
                  tintColor="rgba(16, 185, 129, 0.3)"
                  style={styles.achievedChip}
                >
                  <Ionicons name="checkmark-circle" size={12} color="#fff" />
                  <Text style={styles.achievedChipText}>Achieved</Text>
                </GlassView>
              ) : (
                <View style={styles.achievedChip}>
                  <LinearGradient
                    colors={["rgba(16, 185, 129, 0.25)", "rgba(5, 150, 105, 0.3)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.achievedChipGradient}
                  />
                  <View style={styles.achievedChipContent}>
                    <Ionicons name="checkmark-circle" size={12} color="#fff" />
                    <Text style={styles.achievedChipText}>Achieved</Text>
                  </View>
                </View>
              )
            )}
          </View>
          <View style={styles.timelineIconContainer}>
            <Text style={{ fontSize: 18 }}>
              {getCategoryEmoji(item.category)}
            </Text>
          </View>
        </View>
        <Text style={styles.timelineLabel}>{item.label}</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: `${progressPercentage}%`,
                  backgroundColor: getProgressColor(progressPercentage),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progressPercentage}%
          </Text>
        </View>
        <Text style={styles.goalAmount}>
          {formatGoalProgress(item.current_amount, item.target_amount)}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

export default GoalItem;
