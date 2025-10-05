import React, { useState } from "react";
import {
  View,
  Text,
  Animated,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Goals from "@/app/_components/goals/Goals";
import { useGoals } from "@/app/_hooks/useGoals";

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
    paddingTop: Platform.OS === "ios" ? 8 : 16,
    paddingBottom: 12,
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  iconContainer: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    padding: 10,
    borderRadius: 14,
    marginRight: 14,
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
});

export default function GoalsScreen() {
  const { goalsData, loading, deleteGoal, updateGoal, refreshGoals } = useGoals(
    () => {}
  );
  // Use only initial-load header spinner; pull-to-refresh spinner is handled inside Goals via RefreshControl
  const [hasInitialData, setHasInitialData] = useState(false);
  const goalsAnimations = React.useRef<Animated.Value[]>(
    Array(10)
      .fill(0)
      .map(() => new Animated.Value(0))
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.titleContainer}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="target" size={24} color="#4A90E2" />
          </View>
          <Text style={styles.headerTitle}>Goals</Text>
        </View>
      </View>
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
          // Refresh control manages its own spinner; avoid duplicating header loader
        />
      </View>
    </SafeAreaView>
  );
}
