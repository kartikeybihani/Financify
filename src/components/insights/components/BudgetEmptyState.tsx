import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDemoMode } from "@/src/contexts/DemoContext";

interface BudgetEmptyStateProps {
  onCreateWithFinny: () => void;
  onCreateManually: () => void;
}

export default function BudgetEmptyState({
  onCreateWithFinny,
  onCreateManually,
}: BudgetEmptyStateProps) {
  const { isDemoMode } = useDemoMode();
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Image
            source={require("@/assets/images/finnylap1.png")}
            style={styles.finnyImage}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.title}>Create Your Budget</Text>
        <Text style={styles.description}>
          Set up a personalized budget to track your spending and reach your
          financial goals.
        </Text>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            onPress={onCreateWithFinny}
            activeOpacity={isDemoMode ? 1 : 0.85}
            style={[styles.finnyButtonWrapper, isDemoMode && { opacity: 0.5 }]}
            disabled={isDemoMode}
          >
            <LinearGradient
              colors={["#5B8DEF", "#4A90E2", "#3A7FD1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.finnyButtonGradient}
            >
              <View style={styles.finnyButtonContent}>
                <View style={styles.finnyButtonLeft}>
                  <Text style={styles.finnyButtonText}>
                    Setup with Finny in 30 seconds
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCreateManually}
            activeOpacity={isDemoMode ? 1 : 0.8}
            style={[styles.manualButtonWrapper, isDemoMode && { opacity: 0.5 }]}
            disabled={isDemoMode}
          >
            <View style={styles.manualButtonInner}>
              <Ionicons
                name="construct-outline"
                size={20}
                color="rgba(255, 255, 255, 0.9)"
              />
              <Text style={styles.manualButtonText}>Build it yourself</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 60,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    alignItems: "center",
    maxWidth: 400,
  },
  iconContainer: {
    width: 150,
    height: 150,
    borderRadius: 90,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    overflow: "hidden",
    backgroundColor: "rgba(74, 144, 226, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  finnyImage: {
    width: "100%",
    height: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    marginBottom: 12,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Manrope",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  buttonsContainer: {
    width: "100%",
    alignItems: "center",
    gap: 18,
  },
  finnyButtonWrapper: {
    borderRadius: 90,
    overflow: "hidden",
    alignSelf: "stretch",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  finnyButtonGradient: {
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 15,
  },
  finnyButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  finnyButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  finnyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    letterSpacing: 0.2,
  },
  // Build it yourself Button - sizes to content
  manualButtonWrapper: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    overflow: "hidden",
    alignSelf: "center",
  },
  manualButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  manualButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
    fontFamily: "Manrope",
    letterSpacing: 0.1,
  },
});
