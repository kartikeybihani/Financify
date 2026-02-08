// PremiumLockOverlay.tsx
// Reusable overlay for premium-gated content: light blur so content is visible,
// clear context label so users know what's locked, value-focused CTA.

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Platform,
  UIManager,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export interface PremiumLockOverlayProps {
  /** Short label so user knows what's locked (e.g. "Your goals", "Portfolio movers") */
  title: string;
  /** Optional benefit line (e.g. "Track progress and stay on target") */
  subtitle?: string;
  /** Ionicons name for the section (e.g. "flag", "trending-up", "pie-chart") */
  icon?: keyof typeof Ionicons.glyphMap;
  onUnlock: () => void;
  /** Blur intensity; lower = more glimpse of content (default 22) */
  blurIntensity?: number;
  /** Optional container style */
  style?: ViewStyle;
  /** Center CTA in viewport instead of bottom (default false) */
  centered?: boolean;
  /** Optional font size for title (default 17) */
  titleFontSize?: number;

  /** Visual style variant (default "full") */
  variant?: "full" | "progressiveBottom";
  /** For progressiveBottom: where the lock begins (0..1 from top, default 0.52) */
  progressiveStart?: number;
  /** For progressiveBottom: height of the blur fade-in zone (default 96) */
  progressiveFadeHeight?: number;
  /** Optional bottom safe-area inset (default 0) */
  safeAreaBottom?: number;
}

const LOCK_ICON = "lock-open" as const;

function hasNativeMaskedView() {
  if (Platform.OS === "web") return false;
  const getConfig = (UIManager as any)?.getViewManagerConfig;
  if (typeof getConfig !== "function") return false;
  return Boolean(getConfig("RNCMaskedView"));
}

export function PremiumLockOverlay({
  title,
  subtitle,
  icon = "lock-closed",
  onUnlock,
  blurIntensity = 32,
  style,
  centered = false,
  titleFontSize,
  variant = "full",
  progressiveStart = 0.52,
  progressiveFadeHeight = 96,
  safeAreaBottom = 0,
}: PremiumLockOverlayProps) {
  const [layout, setLayout] = React.useState<{ width: number; height: number }>(
    { width: 0, height: 0 },
  );

  const canUseMaskedView = hasNativeMaskedView();
  const MaskedView = React.useMemo<null | React.ComponentType<
    React.PropsWithChildren<{
      maskElement: React.ReactNode;
      style?: any;
    }>
  >>(() => {
    if (!canUseMaskedView) return null;
    try {
      // Lazy-load so we don't crash if the native view isn't in the current build.
      return require("@react-native-masked-view/masked-view").default;
    } catch {
      return null;
    }
  }, [canUseMaskedView]);

  const height = layout.height || 0;

  const progressiveStartY =
    variant === "progressiveBottom" && height > 0
      ? Math.max(0, Math.min(height, Math.round(height * progressiveStart)))
      : 0;
  const progressiveTop =
    variant === "progressiveBottom" && height > 0
      ? Math.max(0, progressiveStartY - progressiveFadeHeight)
      : 0;
  const progressiveRegionHeight =
    variant === "progressiveBottom" && height > 0
      ? Math.max(1, height - progressiveTop)
      : 1;
  const fadeStop = Math.min(
    0.38,
    Math.max(0.1, progressiveFadeHeight / progressiveRegionHeight),
  );

  if (variant === "progressiveBottom") {
    return (
      <View
        style={[StyleSheet.absoluteFill, style]}
        pointerEvents="box-none"
        onLayout={(e) => {
          const { width, height: nextHeight } = e.nativeEvent.layout;
          if (width === layout.width && nextHeight === layout.height) return;
          setLayout({ width, height: nextHeight });
        }}
      >
        {/* Progressive blur: fade-in blur so top stays crisp, bottom feels locked */}
        {height > 0 ? (
          <View
            style={[styles.progressiveRegion, { top: progressiveTop }]}
            pointerEvents="none"
          >
            {!MaskedView ? (
              <BlurView
                intensity={blurIntensity}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <MaskedView
                style={StyleSheet.absoluteFill}
                maskElement={
                  <LinearGradient
                    colors={[
                      "rgba(255,255,255,0)",
                      "rgba(255,255,255,0.22)",
                      "rgba(255,255,255,1)",
                    ]}
                    locations={[0, fadeStop, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                }
              >
                <BlurView
                  intensity={blurIntensity}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              </MaskedView>
            )}

            {/* Depth + legibility in the locked zone */}
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.75)"]}
              locations={[0, 0.3, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}

        {/* CTA sheet: premium glass, anchored bottom */}
        <View
          style={[
            styles.sheetOuter,
            { paddingBottom: Math.max(16, safeAreaBottom + 12) + 28 },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.sheet} pointerEvents="auto">
            <BlurView
              intensity={Platform.OS === "ios" ? 28 : 20}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.03)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.sheetContent}>
              <View style={styles.labelRow}>
                <Ionicons
                  name={icon}
                  size={20}
                  color="rgba(255, 255, 255, 0.92)"
                  style={styles.labelIcon}
                />
                <Text
                  style={[
                    styles.labelText,
                    titleFontSize != null && { fontSize: titleFontSize },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </View>
              {subtitle ? (
                <Text
                  style={[
                    styles.subtitle,
                    titleFontSize != null && {
                      fontSize: Math.max(12, titleFontSize - 10),
                    },
                  ]}
                  numberOfLines={3}
                >
                  {subtitle}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={onUnlock}
                activeOpacity={0.88}
                style={styles.cta}
              >
                <LinearGradient
                  colors={[
                    "rgba(74, 144, 226, 0.40)",
                    "rgba(74, 145, 226, 0.78)",
                  ]}
                  style={styles.ctaGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={LOCK_ICON} size={18} color="#fff" />
                  <Text style={styles.ctaText}>Unlock with Finny Pro</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="box-none"
      onLayout={(e) => {
        const { width, height: nextHeight } = e.nativeEvent.layout;
        if (width === layout.width && nextHeight === layout.height) return;
        setLayout({ width, height: nextHeight });
      }}
    >
      <BlurView
        intensity={blurIntensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {/* Gradient so top (content) stays more visible, bottom anchors CTA */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.5)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        style={[styles.content, centered && styles.contentCentered]}
        pointerEvents="box-none"
      >
        {/* Context: what is locked */}
        <View style={styles.labelRow}>
          <Ionicons
            name={icon}
            size={20}
            color="rgba(255, 255, 255, 0.9)"
            style={styles.labelIcon}
          />
          <Text
            style={[
              styles.labelText,
              titleFontSize != null && { fontSize: titleFontSize },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              titleFontSize != null && {
                fontSize: Math.max(12, titleFontSize - 10),
              },
            ]}
            numberOfLines={3}
          >
            {subtitle}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={onUnlock}
          activeOpacity={0.88}
          style={styles.cta}
        >
          <LinearGradient
            colors={["rgba(74, 144, 226, 0.45)", "rgba(74, 145, 226, 0.7)"]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name={LOCK_ICON} size={18} color="#fff" />
            <Text style={styles.ctaText}>Unlock with Finny Pro</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressiveRegion: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetOuter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 26,
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12, 16, 22, 0.35)",
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingTop: 30,
    paddingBottom: 30,
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 52,
    paddingTop: 48,
  },
  contentCentered: {
    justifyContent: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    alignSelf: "center",
    maxWidth: 320,
  },
  labelIcon: {
    marginRight: 6,
  },
  labelText: {
    color: "rgba(255, 255, 255, 0.95)",
    fontSize: 17,
    fontWeight: "700",
    ...(Platform.OS === "ios" ? { letterSpacing: 0.2 } : {}),
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    marginBottom: 20,
    textAlign: "center",
    maxWidth: 280,
  },
  cta: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
