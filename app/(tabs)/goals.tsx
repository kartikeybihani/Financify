import React, { useState } from "react";
import {
  View,
  Text,
  Animated,
  Platform,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Goals from "@/src/components/goals/Goals";
import { useGoals } from "@/src/hooks/useGoals";
import { notificationService } from "@/src/utils/core/notificationService";
import CleanGoalsHeader from "@/src/components/goals/CleanGoalsHeader";
import logger from "@/src/utils/core/logger";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 12,
    paddingBottom: 10,
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(74, 144, 226, 0.1)",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  iconContainer: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    padding: 10,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  contentContainer: {
    flex: 1,
    backgroundColor: "#121212",
  },
  loadingContainer: {
    paddingVertical: 12,
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  testButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 100, // Add extra padding to clear the tab bar
    backgroundColor: "#121212",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  testButton: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    flex: 0.48,
  },
  testButtonText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  mascotIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});

export default function GoalsScreen() {
  const { goalsData, loading, deleteGoal, updateGoal, refreshGoals } = useGoals(
    () => {},
  );
  // Use only initial-load header spinner; pull-to-refresh spinner is handled inside Goals via RefreshControl
  const [hasInitialData, setHasInitialData] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const goalsAnimations = React.useRef<Animated.Value[]>(
    Array(10)
      .fill(0)
      .map(() => new Animated.Value(0)),
  ).current;

  React.useEffect(() => {
    goalsAnimations.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: index * 150,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  React.useEffect(() => {
    if (goalsData.length > 0) {
      setHasInitialData(true);
    }
  }, [goalsData]);

  const handleTestNotification = async () => {
    try {
      setIsTestingNotification(true);

      // Request permissions first
      const hasPermission = await notificationService.requestPermissions();
      if (!hasPermission) {
        return;
      }

      // Send test notification
      await notificationService.sendTestNotification();
    } catch (error) {
      logger.error("Error testing notification:", error);
    } finally {
      setIsTestingNotification(false);
    }
  };

  const handleMotivationalNotification = async () => {
    try {
      setIsTestingNotification(true);

      // Request permissions first
      const hasPermission = await notificationService.requestPermissions();
      if (!hasPermission) {
        return;
      }

      // Send motivational notification
      await notificationService.sendMotivationalNotification();
    } catch (error) {
      logger.error("Error sending motivational notification:", error);
    } finally {
      setIsTestingNotification(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      {/* Clean Header with Gradient */}
      <CleanGoalsHeader />
      {loading && !hasInitialData && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#4A90E2" />
        </View>
      )}

      <View style={styles.contentContainer}>
        <Goals
          goalsData={goalsData}
          goalsAnimations={goalsAnimations}
          deleteGoal={deleteGoal}
          updateGoal={updateGoal}
          refreshGoals={refreshGoals}
          // Refresh control manages its own spinner; avoid duplicating header loader
        />
      </View>

      {/* Test Notification Buttons */}
      {/* <View style={styles.testButtonContainer}>
        <TouchableOpacity
          style={styles.testButton}
          onPress={handleTestNotification}
          disabled={isTestingNotification}
          activeOpacity={0.7}
        >
          <Image
            source={require("@/assets/images/mascotgpt.png")}
            style={styles.mascotIcon}
          />
          <Text style={styles.testButtonText}>
            {isTestingNotification ? "Sending..." : "Test"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.testButton}
          onPress={handleMotivationalNotification}
          disabled={isTestingNotification}
          activeOpacity={0.7}
        >
          <Image
            source={require("@/assets/images/mascotgpt.png")}
            style={styles.mascotIcon}
          />
          <Text style={styles.testButtonText}>
            {isTestingNotification ? "Sending..." : "Motivate"}
          </Text>
        </TouchableOpacity>
      </View> */}
    </SafeAreaView>
  );
}
