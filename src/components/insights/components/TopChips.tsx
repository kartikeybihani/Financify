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

export type SectionConfig = {
  key: string;
  label: string;
};

interface TopChipsProps {
  sections: SectionConfig[];
  activeIndex: number;
  onChange: (index: number) => void;
}

export default function TopChips({
  sections,
  activeIndex,
  onChange,
}: TopChipsProps) {
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
    Partial<Record<number, { x: number; width: number }>>
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
        Math.max(0, (contentWidth - viewportWidth) / 2),
      );
      scrollRef.current.scrollTo({ x: targetX, animated: false });
      hasAutoScrolledRef.current = true;
    }
  }, [contentWidth, viewportWidth]);

  // Scroll to center the active chip when selection changes
  React.useEffect(() => {
    const scrollView = scrollRef.current;
    if (!scrollView || viewportWidth <= 0 || contentWidth <= 0) return;
    const layout = chipLayoutsRef.current[activeIndex];
    if (!layout) return;

    const maxScrollableX = Math.max(0, contentWidth - viewportWidth);
    const centeredX = layout.x + layout.width / 2 - viewportWidth / 2;
    const targetX = Math.min(maxScrollableX, Math.max(0, centeredX));
    scrollView.scrollTo({ x: targetX, animated: true });
  }, [activeIndex, viewportWidth, contentWidth]);

  const renderChip = (section: SectionConfig, index: number) => {
    const CardShell = shouldUseLiquidGlass ? GlassView : View;
    const isActive = activeIndex === index;

    const activeGradientColors = shouldUseLiquidGlass
      ? ["#022c59", "#1d61ab", "#4088d6", "#022c59"]
      : [
          "rgba(122, 176, 238, 0.7)",
          "rgba(92, 151, 224, 0.78)",
          "rgba(63, 124, 198, 0.76)",
        ];

    return (
      <TouchableOpacity
        key={section.key}
        onPress={() => onChange(index)}
        activeOpacity={0.85}
        style={styles.chipTouchable}
        onLayout={(e) => {
          chipLayoutsRef.current[index] = {
            x: e.nativeEvent.layout.x,
            width: e.nativeEvent.layout.width,
          };
        }}
      >
        {isActive ? (
          <LinearGradient
            colors={activeGradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.gradientChip,
              !shouldUseLiquidGlass && styles.gradientChipFallback,
            ]}
          >
            <Text style={[styles.chipText, styles.chipTextActive]}>
              {section.label}
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
            style={[
              styles.glassChip,
              !shouldUseLiquidGlass && styles.glassChipFallback,
            ]}
          >
            <Text style={styles.chipText}>{section.label}</Text>
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
        {sections.map((section, index) => renderChip(section, index))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#121212",
  },
  chipsRow: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 8,
  },
  chipTouchable: {
    marginRight: 0,
  },
  glassChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: "hidden",
  },
  glassChipFallback: {
    backgroundColor: "rgba(20, 20, 25, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  gradientChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: "hidden",
  },
  gradientChipFallback: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
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
