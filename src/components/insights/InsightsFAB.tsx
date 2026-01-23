import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { fabStyles } from "@/src/styles/insightsStyles";
import { FAB_BUTTON_GRADIENT_COLORS } from "@/src/components/insights/components/AddCategoryModal";

interface InsightsFABProps {
  onPress: () => void;
}

export default function InsightsFAB({ onPress }: InsightsFABProps) {
  return (
    <View style={fabStyles.container}>
      <TouchableOpacity
        onPress={onPress}
        style={fabStyles.button}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={FAB_BUTTON_GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={fabStyles.addButton}
        >
          <Ionicons name="add-outline" size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
