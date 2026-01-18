import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface ReAuthBannerProps {
  institutionName: string;
  onReAuth: () => void;
  onDismiss?: () => void;
  type?: "re_auth" | "new_accounts";
}

export default function ReAuthBanner({
  institutionName,
  onReAuth,
  onDismiss,
  type = "re_auth",
}: ReAuthBannerProps) {
  const isNewAccounts = type === "new_accounts";
  
  const iconName = isNewAccounts ? "add-circle" : "refresh-circle";
  const iconColor = isNewAccounts ? "#4CAF50" : "#FF9500";
  const title = isNewAccounts 
    ? "New Accounts Available" 
    : "Connection Update Required";
  const subtitle = isNewAccounts
    ? `Add new accounts for ${institutionName}`
    : `${institutionName} needs to be reconnected`;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={
          isNewAccounts
            ? ["rgba(76, 175, 80, 0.08)", "rgba(76, 175, 80, 0.03)"]
            : ["rgba(255, 149, 0, 0.08)", "rgba(255, 149, 0, 0.03)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={[styles.iconContainer, { backgroundColor: isNewAccounts ? "rgba(76, 175, 80, 0.12)" : "rgba(255, 149, 0, 0.12)" }]}>
              <Ionicons name={iconName} size={22} color={iconColor} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: isNewAccounts ? "rgba(76, 175, 80, 0.12)" : "rgba(255, 149, 0, 0.12)",
                  borderColor: isNewAccounts ? "rgba(76, 175, 80, 0.25)" : "rgba(255, 149, 0, 0.25)",
                },
              ]}
              onPress={onReAuth}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionButtonText, { color: iconColor }]}>
                {isNewAccounts ? "Add" : "Update"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={iconColor} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gradient: {
    padding: 14,
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
    marginRight: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  dismissButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
});
