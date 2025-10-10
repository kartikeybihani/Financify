import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  TouchableOpacity,
} from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GoalNotificationProps } from "@/app/_types/goalsTypes";

const { width } = Dimensions.get("window");

export const GoalNotification: React.FC<GoalNotificationProps> = ({
  message,
  action,
  goalId,
  onClose,
  onUndo,
}) => {
  // Position notification higher when it's an update (modal is open)
  const notificationBottom = 100;
  const translateY = new Animated.Value(notificationBottom); // Start from bottom
  const opacity = new Animated.Value(0);

  useEffect(() => {
    // Slide in from bottom - faster animation
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto close after 3 seconds
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: notificationBottom,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onClose());
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleUndo = () => {
    if (onUndo && goalId) {
      onUndo(goalId);
      onClose();
    }
  };

  // Only show the new style for iOS
  if (Platform.OS !== "ios") return null;

  const showUndo = action === "delete" && onUndo && goalId;
  const isDeleteAction = action === "delete";
  const isUpdateAction = action === "update";
  const isCreateAction = action === "create";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: notificationBottom,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <BlurView
        intensity={80}
        tint="dark"
        style={[
          styles.blurContainer,
          isDeleteAction && styles.deleteBlurContainer,
          isUpdateAction && styles.updateBlurContainer,
          isCreateAction && styles.createBlurContainer,
        ]}
      >
        <View style={[styles.content, !showUndo && styles.centeredContent]}>
          {showUndo ? (
            <>
              <View style={styles.leftSection}>
                <MaterialCommunityIcons
                  name={
                    action === "delete"
                      ? "delete-circle"
                      : action === "create"
                      ? "target"
                      : "check-circle"
                  }
                  size={action === "delete" ? 24 : 20}
                  color={
                    action === "delete"
                      ? "#FF3B30"
                      : action === "create"
                      ? "#4A90E2"
                      : "#32D74B"
                  }
                  style={styles.icon}
                />
                <Text style={styles.message}>{message}</Text>
              </View>
              <TouchableOpacity
                style={styles.undoButton}
                onPress={handleUndo}
                activeOpacity={0.7}
              >
                <Text style={styles.undoText}>Undo</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.centeredSection}>
              <MaterialCommunityIcons
                name={
                  action === "delete"
                    ? "delete-circle"
                    : action === "create"
                    ? "target"
                    : "check-circle"
                }
                size={action === "delete" ? 24 : 20}
                color={
                  action === "delete"
                    ? "#FF3B30"
                    : action === "create"
                    ? "#4A90E2"
                    : "#32D74B"
                }
                style={styles.icon}
              />
              <Text style={styles.message}>{message}</Text>
            </View>
          )}
        </View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: "center",
  },
  blurContainer: {
    borderRadius: 50,
    marginHorizontal: 40,
    minWidth: width * 0.7,
    maxWidth: width * 0.8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  centeredContent: {
    justifyContent: "center",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  centeredSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginRight: 12,
  },
  message: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  undoButton: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    marginLeft: 12,
  },
  undoText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteBlurContainer: {
    minWidth: width * 0.85,
    maxWidth: width * 0.9,
    marginHorizontal: 20,
  },
  updateBlurContainer: {
    minWidth: width * 0.6,
    maxWidth: width * 0.7,
    marginHorizontal: 50,
  },
  createBlurContainer: {
    minWidth: width * 0.75,
    maxWidth: width * 0.85,
    marginHorizontal: 30,
  },
});

export default GoalNotification;
