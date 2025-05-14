import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Animated,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Timeline from "../components/Timeline";
import { useGoals } from "../hooks/useGoals";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 10 : 20,
    paddingBottom: 16,
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

export default function TimelineScreen() {
  const { timelineData, deleteGoal } = useGoals(() => {});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timelineAnimations = React.useRef<Animated.Value[]>(
    Array(10)
      .fill(0)
      .map(() => new Animated.Value(0))
  ).current;

  React.useEffect(() => {
    timelineAnimations.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: index * 150,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.titleContainer}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name="timeline-check-outline"
              size={24}
              color="#4A90E2"
            />
          </View>
          <Text style={styles.headerTitle}>Timeline</Text>
        </View>
      </View>
      {isRefreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#4A90E2" />
        </View>
      )}
      <View style={styles.contentContainer}>
        <Timeline
          timelineData={timelineData}
          timelineAnimations={timelineAnimations}
          deleteGoal={deleteGoal}
          onRefreshStart={() => setIsRefreshing(true)}
          onRefreshEnd={() => setIsRefreshing(false)}
        />
      </View>
    </SafeAreaView>
  );
}
