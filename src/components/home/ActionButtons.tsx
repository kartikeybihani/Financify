// components/home/ActionButtons.tsx

import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { styles } from "@/src/styles/homeStyles";
import logger from "@/src/utils/core/logger";
import { useDemoMode } from "@/src/contexts/DemoContext";

interface ActionButtonsProps {
  onAddAccount: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = React.memo(
  ({ onAddAccount }) => {
    const { isDemoMode } = useDemoMode();
    return (
      <TouchableOpacity
        style={[styles.addAccountButton, isDemoMode && { opacity: 0.5 }]}
        onPress={() => {
          if (isDemoMode) return;
          logger.info("Add Another Account pressed from home screen");
          onAddAccount();
        }}
        disabled={isDemoMode}
        activeOpacity={isDemoMode ? 1 : 0.8}
      >
        <Text style={styles.addAccountButtonText}>+ Add Another Account</Text>
      </TouchableOpacity>
    );
  }
);

ActionButtons.displayName = "ActionButtons";
