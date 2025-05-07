import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface GoalNotificationProps {
  message: string; // This will now be just the goal label
  onClose: () => void;
}

const { width } = Dimensions.get("window");

export const GoalNotification: React.FC<GoalNotificationProps> = ({
  message,
  onClose,
}) => {
  const translateY = new Animated.Value(-100);
  const opacity = new Animated.Value(0);

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto close after 3 seconds
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => onClose());
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Only show the new style for iOS
  if (Platform.OS !== "ios") return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <BlurView intensity={60} tint="dark" style={styles.blurContainer}>
        <LinearGradient
          colors={["rgba(74,144,226,0.7)", "rgba(30,30,30,0.8)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <MaterialCommunityIcons
          name="check-circle"
          size={22}
          color="#4A90E2"
          style={{ marginRight: 10, zIndex: 2 }}
        />
        <Text style={styles.message}>{message}</Text>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: -65, // below status bar for iOS
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: "center",
  },
  blurContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 18,
    marginHorizontal: 16,
    minWidth: width * 0.85,
    backgroundColor: "rgba(30, 30, 30, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  message: {
    color: "#fff",
    fontSize: 16,
    marginLeft: 2,
    flex: 1,
    fontWeight: "600",
    zIndex: 2,
  },
});

export default GoalNotification;
