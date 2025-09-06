import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface ReAuthBannerProps {
  institutionName: string;
  onReAuth: () => void;
  onDismiss?: () => void;
}

export default function ReAuthBanner({
  institutionName,
  onReAuth,
  onDismiss,
}: ReAuthBannerProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["rgba(255, 159, 64, 0.1)", "rgba(255, 159, 64, 0.05)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning-outline" size={20} color="#FF9F40" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>Connection Update Required</Text>
              <Text style={styles.subtitle}>
                {institutionName} needs to be reconnected
              </Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onReAuth}
              activeOpacity={0.7}
            >
              <Text style={styles.actionButtonText}>Update</Text>
              <Ionicons name="chevron-forward" size={14} color="#FF9F40" />
            </TouchableOpacity>

            {onDismiss && (
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={onDismiss}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* Subtle border */}
      <View style={styles.border} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#FF9F40",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gradient: {
    padding: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 159, 64, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
    lineHeight: 16,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 159, 64, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 159, 64, 0.3)",
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF9F40",
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(153, 153, 153, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  border: {
    position: "absolute",
    bottom: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: "rgba(255, 159, 64, 0.2)",
  },
});
