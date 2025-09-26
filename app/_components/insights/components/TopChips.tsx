import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { GlassView } from "expo-glass-effect";

type SectionKey =
  | "investments"
  | "spending"
  | "transactions"
  | "recurring"
  | "cashflow";

interface TopChipsProps {
  activeSection: SectionKey;
  onChange: (section: SectionKey) => void;
}

const labels: { key: SectionKey; label: string }[] = [
  { key: "investments", label: "Investments" },
  { key: "spending", label: "Spending" },
  { key: "transactions", label: "Transactions" },
  { key: "recurring", label: "Recurring" },
  { key: "cashflow", label: "Cash Flow" },
];

export default function TopChips({ activeSection, onChange }: TopChipsProps) {
  // Check if we should use iOS 18+ liquid glass effect (matching RecurringSection)
  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;

  const renderChip = (key: SectionKey, label: string) => {
    const CardShell = shouldUseLiquidGlass ? GlassView : View;

    return (
      <TouchableOpacity
        key={key}
        onPress={() => onChange(key)}
        activeOpacity={0.85}
        style={styles.chipTouchable}
      >
        <CardShell
          {...(shouldUseLiquidGlass
            ? {
                glassEffectStyle: "regular",
                tintColor:
                  activeSection === key
                    ? "rgba(74, 144, 226, 0.9)"
                    : "rgba(20, 20, 25, 0.9)",
              }
            : {})}
          style={styles.glassChip}
        >
          <Text
            style={[
              styles.chipText,
              activeSection === key && styles.chipTextActive,
            ]}
          >
            {label}
          </Text>
        </CardShell>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {labels.map(({ key, label }) => renderChip(key, label))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 16,
    backgroundColor: "#121212",
  },
  chipsRow: {
    paddingHorizontal: 0,
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
