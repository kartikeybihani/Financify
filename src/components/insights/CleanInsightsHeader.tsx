import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Animated,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncStatus } from "@/src/types/insights";

interface CleanInsightsHeaderProps {
  isSyncing: boolean;
  syncStatus: SyncStatus;
  onRefresh: () => void;
}

export default function CleanInsightsHeader({
  isSyncing,
  syncStatus,
  onRefresh,
}: CleanInsightsHeaderProps) {
  const insets = useSafeAreaInsets();
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  // Animate rotation when syncing
  React.useEffect(() => {
    if (isSyncing) {
      const rotation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      );
      rotation.start();
      return () => rotation.stop();
    } else {
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isSyncing]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const handlePress = () => {
    if (isSyncing) return;
    onRefresh();
  };

  const handleLongPress = () => {
    if (syncStatus.lastSync) {
      Alert.alert(
        "Sync Status",
        `Last sync: ${syncStatus.lastSync}\nNext sync: ${syncStatus.nextSync}\n\nData syncs automatically every day at 8 AM ET.`,
        [{ text: "OK" }],
      );
    }
  };

  return (
    <LinearGradient
      colors={
        [
          "rgba(74, 145, 226, 0.45)",
          "rgba(53, 120, 255, 0.26)",
          "transparent",
        ] as const
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.gradientContainer,
        {
          paddingTop: insets.top + (Platform.OS === "ios" ? 0 : 8),
        },
      ]}
    >
      <View style={styles.headerContent}>
        {/* Centered "Insights" text */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Insights</Text>
        </View>

        {/* Refresh button on the right - absolutely positioned */}
        <TouchableOpacity
          style={[
            styles.refreshButton,
            isSyncing && styles.refreshButtonSyncing,
          ]}
          onPress={handlePress}
          onLongPress={handleLongPress}
          disabled={isSyncing}
          activeOpacity={0.7}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <MaterialIcons
              name={isSyncing ? "hourglass-empty" : "sync"}
              size={18}
              color="#4A90E2"
            />
          </Animated.View>

          {/* Sync status indicator badge */}
          {syncStatus.lastSync && !isSyncing && (
            <View style={styles.statusBadge}>
              <Ionicons
                name={syncStatus.isAutomated ? "time-outline" : "sync-outline"}
                size={8}
                color="#4CAF50"
              />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    paddingBottom: 4,
    backgroundColor: "#121212",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 1,
    minHeight: 34,
    position: "relative",
  },
  titleContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.3,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20, 20, 25, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    position: "absolute",
    right: 20,
    top: "50%",
    marginTop: -18, // Half of button height to center vertically
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  refreshButtonSyncing: {
    opacity: 0.7,
    borderColor: "rgba(74, 144, 226, 0.5)",
  },
  statusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(76, 175, 80, 0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(76, 175, 80, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
