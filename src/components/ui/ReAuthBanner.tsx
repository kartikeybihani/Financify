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
  const theme = isNewAccounts
    ? {
        icon: "add-circle" as const,
        color: "#4CAF50",
        title: "New Accounts Available",
        subtitle: `Add new accounts for ${institutionName}`,
        gradient: ["rgba(76, 175, 80, 0.08)", "rgba(76, 175, 80, 0.03)"] as const,
        chip: "rgba(76, 175, 80, 0.12)",
        border: "rgba(76, 175, 80, 0.25)",
        cta: "Add",
      }
    : {
        icon: "refresh-circle" as const,
        color: "#FF9500",
        title: "Connection Update Required",
        subtitle: `${institutionName} needs to be reconnected`,
        gradient: ["rgba(255, 149, 0, 0.08)", "rgba(255, 149, 0, 0.03)"] as const,
        chip: "rgba(255, 149, 0, 0.12)",
        border: "rgba(255, 149, 0, 0.25)",
        cta: "Update",
      };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <View style={[styles.iconContainer, { backgroundColor: theme.chip }]}>
              <Ionicons name={theme.icon} size={22} color={theme.color} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{theme.title}</Text>
              <Text style={styles.subtitle}>{theme.subtitle}</Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: theme.chip,
                  borderColor: theme.border,
                },
              ]}
              onPress={onReAuth}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionButtonText, { color: theme.color }]}>
                {theme.cta}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.color} />
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
    marginHorizontal: 0,
    marginBottom: 12,
    borderRadius: 0,
    overflow: "hidden",
  },
  gradient: {
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    width: 38,
    height: 38,
    borderRadius: 19,
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
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#A5A5A5",
    lineHeight: 18,
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
    borderWidth: 0,
    gap: 5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dismissButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
});
