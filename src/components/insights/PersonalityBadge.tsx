import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SpendingPersonality } from "@/src/utils/analytics/personalityAnalysis";

interface PersonalityBadgeProps {
  personality: SpendingPersonality;
  onPress?: () => void;
  showDetails?: boolean;
}

export default function PersonalityBadge({
  personality,
  onPress,
  showDetails = false,
}: PersonalityBadgeProps) {
  const colors = {
    primary: personality.color,
    secondary: `${personality.color}10`,
    background: `${personality.color}08`,
    text: personality.color,
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderColor: `${personality.color}15`,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Top Row: Mascot | Title & Subtitle | Percentage & Chevron */}
      <View style={styles.topRow}>
        {/* Mascot Image - Left Side */}
        <View style={styles.mascotContainer}>
          <Image
            source={require("../../../assets/images/midleftshot.png")}
            style={styles.mascotImage}
            resizeMode="cover"
          />
          <View
            style={[
              styles.emojiBadge,
              { backgroundColor: `${personality.color}20` },
            ]}
          >
            <Text style={styles.emoji}>{personality.emoji}</Text>
          </View>
        </View>

        {/* Title & Subtitle - Middle */}
        <View style={styles.textContainer}>
          <Text style={[styles.archetype, { color: colors.primary }]}>
            {personality.archetype}
          </Text>
          {showDetails && <Text style={styles.badge}>{personality.badge}</Text>}
        </View>

        {/* Percentage & Chevron - Right Side */}
        <View style={styles.rightSection}>
          {showDetails && (
            <View
              style={[
                styles.confidenceBadge,
                { backgroundColor: `${personality.color}15` },
              ]}
            >
              <Text style={[styles.confidence, { color: colors.primary }]}>
                {personality.confidence}%
              </Text>
            </View>
          )}
          {onPress && (
            <Ionicons
              name="chevron-forward"
              size={14}
              color="rgba(255, 255, 255, 0.3)"
              style={styles.chevron}
            />
          )}
        </View>
      </View>

      {/* Traits Below - Full Width */}
      {showDetails && (
        <View style={styles.chipsContainer}>
          {personality.traits.slice(0, 1).map((trait, index) => (
            <View
              key={index}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.secondary,
                  borderColor: `${personality.color}20`,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: colors.primary }]}>
                {trait}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  mascotContainer: {
    position: "relative",
    marginRight: 12,
  },
  mascotImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    // borderWidth: 2,
    // borderColor: "rgba(255, 255, 255, 0.1)",
  },
  emojiBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1f1f1f",
  },
  emoji: {
    fontSize: 12,
  },
  textContainer: {
    flex: 1,
  },
  archetype: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  badge: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 0,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "500",
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  confidence: {
    fontSize: 11,
    fontWeight: "700",
  },
  chevron: {
    // No margin needed, gap handles spacing
  },
});
