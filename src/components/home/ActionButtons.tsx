// components/home/ActionButtons.tsx

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "@/src/styles/homeStyles";
import logger from "@/src/utils/core/logger";

interface ActionButtonsProps {
  onAddAccount: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = React.memo(
  ({ onAddAccount }) => {
    return (
      <TouchableOpacity
        style={styles.addAccountButton}
        onPress={() => {
          logger.info("Add Another Account pressed from home screen");
          onAddAccount();
        }}
      >
        <Text style={styles.addAccountButtonText}>+ Add Another Account</Text>
      </TouchableOpacity>
    );
  }
);

ActionButtons.displayName = "ActionButtons";
