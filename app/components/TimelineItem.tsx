import React from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/timelineSyles";
import { TimelineItemProps, IconType } from "../types/timelineTypes";

const getTimelineIcon = (label: string): IconType => {
  if (label.toLowerCase().includes("saving")) return "wallet-outline";
  if (label.toLowerCase().includes("car")) return "car-outline";
  if (label.toLowerCase().includes("home")) return "home-outline";
  if (label.toLowerCase().includes("education")) return "school-outline";
  if (label.toLowerCase().includes("fire")) return "flame-outline";
  if (label.toLowerCase().includes("watch")) return "watch-outline";
  return "flag-outline";
};

const TimelineItem: React.FC<TimelineItemProps> = ({
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
            {`${item.timeline.month} ${item.timeline.year}`}
          </Text>
          <View style={styles.timelineIconContainer}>
            <Ionicons
              name={getTimelineIcon(item.label)}
              size={18}
              color="#4A90E2"
            />
          </View>
        </View>
        <Text style={styles.timelineLabel}>{item.label}</Text>
        {typeof item.progress === "number" && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBackground}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${item.progress}%`,
                    backgroundColor:
                      item.progress >= 100 ? "#4CD964" : "#4A90E2",
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{item.progress}%</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

export default TimelineItem;
