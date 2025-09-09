import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { NUDGE_OPTIONS } from "../constants/finny";
import styles from "../styles/chatStyles";

interface NudgeGridProps {
  onNudgePress: (text: string) => void;
}

export const NudgeGrid = ({ onNudgePress }: NudgeGridProps) => {
  return (
    <View style={styles.nudgeContainer}>
      <Text style={styles.nudgeHeaderText}>Try asking Finny</Text>
      <View style={styles.nudgeGrid}>
        {NUDGE_OPTIONS.map((nudge) => (
          <TouchableOpacity
            key={nudge.id}
            style={styles.nudgeBox}
            onPress={() => onNudgePress(nudge.text)}
          >
            <Text style={styles.nudgeText}>{nudge.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default NudgeGrid;
