import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { NUDGE_OPTIONS } from "../constants/finny";
import styles from "../styles/finnyStyles";

interface NudgeGridProps {
  onNudgePress: (text: string) => void;
}

export const NudgeGrid = ({ onNudgePress }: NudgeGridProps) => {
  return (
    <View style={styles.nudgeContainer}>
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
