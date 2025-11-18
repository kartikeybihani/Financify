import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
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
    secondary: `${personality.color}15`,
    background: `${personality.color}15`,
    text: personality.color,
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.background }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View
          style={[styles.emojiContainer, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.emoji}>{personality.emoji}</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.archetype, { color: colors.primary }]}>
            {personality.archetype}
          </Text>
          <Text style={styles.badge}>{personality.badge}</Text>
        </View>
        {showDetails && (
          <Text style={[styles.confidence, { color: colors.primary }]}>
            {personality.confidence}%
          </Text>
        )}
        {onPress && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.primary}
            style={styles.chevron}
          />
        )}
      </View>

      <Text style={styles.description}>{personality.description}</Text>

      {showDetails && (
        <View style={styles.chipsContainer}>
          {personality.traits.slice(0, 2).map((trait, index) => (
            <View
              key={index}
              style={[styles.chip, { backgroundColor: colors.secondary }]}
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
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  emojiContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  emoji: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  archetype: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  badge: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  chevron: {
    marginLeft: 8,
  },
  confidence: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  description: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 8,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
