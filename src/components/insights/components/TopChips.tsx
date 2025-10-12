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
import { LinearGradient } from "expo-linear-gradient";

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
  { key: "recurring", label: "Recurring" },
  { key: "transactions", label: "Transactions" },
  { key: "spending", label: "Spending" },
  { key: "investments", label: "Investments" },
  { key: "cashflow", label: "Cash Flow" },
];

export default function TopChips({ activeSection, onChange }: TopChipsProps) {
  // Check if we should use iOS 18+ liquid glass effect (matching RecurringSection)
  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS
    ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
    : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;

  // Auto-scroll to approximately halfway across the chips on mount
  const scrollRef = React.useRef<ScrollView>(null);
  const [contentWidth, setContentWidth] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const hasAutoScrolledRef = React.useRef(false);
  const chipLayoutsRef = React.useRef<
    Partial<Record<SectionKey, { x: number; width: number }>>
  >({});

  React.useEffect(() => {
    if (
      scrollRef.current &&
      contentWidth > 0 &&
      viewportWidth > 0 &&
      !hasAutoScrolledRef.current
    ) {
      const maxScrollableX = Math.max(0, contentWidth - viewportWidth);
      // Aim for the middle of the content; clamp to scrollable range
      const targetX = Math.min(
        maxScrollableX,
        Math.max(0, (contentWidth - viewportWidth) / 2)
      );
      scrollRef.current.scrollTo({ x: targetX, animated: false });
      hasAutoScrolledRef.current = true;
    }
  }, [contentWidth, viewportWidth]);

  // Scroll to center the active chip when selection changes
  React.useEffect(() => {
    const scrollView = scrollRef.current;
    if (!scrollView || viewportWidth <= 0 || contentWidth <= 0) return;
    const layout = chipLayoutsRef.current[activeSection];
    if (!layout) return;

    const maxScrollableX = Math.max(0, contentWidth - viewportWidth);
    const centeredX = layout.x + layout.width / 2 - viewportWidth / 2;
    const targetX = Math.min(maxScrollableX, Math.max(0, centeredX));
    scrollView.scrollTo({ x: targetX, animated: true });
  }, [activeSection, viewportWidth, contentWidth]);

  const renderChip = (key: SectionKey, label: string) => {
    const CardShell = shouldUseLiquidGlass ? GlassView : View;
    const isActive = activeSection === key;

    return (
      <TouchableOpacity
        key={key}
        onPress={() => onChange(key)}
        activeOpacity={0.85}
        style={styles.chipTouchable}
        onLayout={(e) => {
          chipLayoutsRef.current[key] = {
            x: e.nativeEvent.layout.x,
            width: e.nativeEvent.layout.width,
          };
        }}
      >
        {isActive ? (
          <LinearGradient
            colors={["#022c59", "#1d61ab", "#4088d6", "#022c59"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientChip}
          >
            <Text style={[styles.chipText, styles.chipTextActive]}>
              {label}
            </Text>
          </LinearGradient>
        ) : (
          <CardShell
            {...(shouldUseLiquidGlass
              ? {
                  glassEffectStyle: "regular",
                  tintColor: "rgba(20, 20, 25, 0.9)",
                }
              : {})}
            style={styles.glassChip}
          >
            <Text style={styles.chipText}>{label}</Text>
          </CardShell>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={(w) => setContentWidth(w)}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
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
    paddingVertical: 12,
    backgroundColor: "#121212",
  },
  chipsRow: {
    paddingHorizontal: 0,
    gap: 8,
  },
  chipTouchable: {
    marginRight: 8,
  },
  glassChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: "hidden",
  },
  gradientChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: "hidden",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C7C7CC",
    letterSpacing: 0.2,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
});
