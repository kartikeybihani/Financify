import React from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { styles } from "@/src/styles/goalsStyles";
import { GoalItemProps } from "@/src/types/goalsTypes";
import {
  getCategoryEmoji,
  getCategoryColor,
  calculateProgressPercentage,
  formatGoalProgress,
  getProgressColor,
} from "../../../src/utils/goalCategories";

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
          <Text style={styles.timelineYear}>
            {new Date(item.target_date).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </Text>
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
                  width: `${calculateProgressPercentage(
                    item.current_amount,
                    item.target_amount
                  )}%`,
                  backgroundColor: getProgressColor(
                    calculateProgressPercentage(
                      item.current_amount,
                      item.target_amount
                    )
                  ),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {calculateProgressPercentage(
              item.current_amount,
              item.target_amount
            )}
            %
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
