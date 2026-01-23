import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { styles } from "@/src/styles/insightsStyles";
import { headerRefreshStyles } from "@/src/styles/insightsStyles";
import { SyncStatus } from "@/src/types/insights";

interface InsightsHeaderProps {
  isSyncing: boolean;
  syncStatus: SyncStatus;
  onRefresh: () => void;
}

export default function InsightsHeader({
  isSyncing,
  syncStatus,
  onRefresh,
}: InsightsHeaderProps) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.titleContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="stats-chart" size={24} color="#4A90E2" />
        </View>
        <View>
          <Text style={styles.headerTitle}>Insights</Text>
          <Text style={styles.headerSubtitle}>Your Financial Analytics</Text>
        </View>
      </View>

      {/* Header Refresh Icons */}
      <View style={headerRefreshStyles.container}>
        <TouchableOpacity
          style={[
            headerRefreshStyles.iconButton,
            isSyncing && headerRefreshStyles.iconButtonDisabled,
          ]}
          onPress={onRefresh}
          disabled={isSyncing}
        >
          <MaterialIcons
            name={isSyncing ? "hourglass-empty" : "sync"}
            size={18}
            color="#4A90E2"
          />
        </TouchableOpacity>

        {/* Sync Status Indicator */}
        {syncStatus.lastSync && (
          <TouchableOpacity
            style={headerRefreshStyles.syncStatusButton}
            onPress={() => {
              // Show sync status details
              Alert.alert(
                "Sync Status",
                `Last sync: ${syncStatus.lastSync}\nNext sync: ${syncStatus.nextSync}\n\nData syncs automatically every day at 8 AM ET.`,
                [{ text: "OK" }],
              );
            }}
          >
            <Ionicons
              name={syncStatus.isAutomated ? "time-outline" : "sync-outline"}
              size={16}
              color="#4CAF50"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
