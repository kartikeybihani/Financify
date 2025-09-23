import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

type SectionKey = "cashflow" | "spending" | "transactions" | "recurring";

interface TopChipsProps {
  activeSection: SectionKey;
  onChange: (section: SectionKey) => void;
}

const labels: { key: SectionKey; label: string }[] = [
  { key: "cashflow", label: "Cash Flow" },
  { key: "spending", label: "Spending" },
  { key: "transactions", label: "Transactions" },
  { key: "recurring", label: "Recurring" },
];

export default function TopChips({ activeSection, onChange }: TopChipsProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {labels.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            activeOpacity={0.85}
            style={styles.chipTouchable}
          >
            {activeSection === key ? (
              <LinearGradient
                colors={["#4A90E2", "#0F1218", "#7B8794"]}
                locations={[0, 0.65, 1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.95, y: 1 }}
                style={[styles.glassChip, styles.gradientActive]}
              >
                <Text style={[styles.chipText, styles.chipTextActive]}>
                  {label}
                </Text>
              </LinearGradient>
            ) : Platform.OS === "ios" ? (
              <BlurView tint="dark" intensity={28} style={styles.glassChip}>
                <Text style={styles.chipText}>{label}</Text>
              </BlurView>
            ) : (
              <View style={styles.glassChip}>
                <Text style={styles.chipText}>{label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#121212",
  },
  chipsRow: {
    paddingHorizontal: 2,
    gap: 10,
  },
  chipTouchable: {
    marginRight: 10,
  },
  glassChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  gradientActive: {
    borderRadius: 18,
    overflow: "hidden",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#C7C7CC",
    letterSpacing: 0.2,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
});
