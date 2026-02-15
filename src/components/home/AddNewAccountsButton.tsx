// components/home/AddNewAccountsButton.tsx

import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { styles } from "@/src/styles/homeStyles";

interface AddNewAccountsButtonProps {
  onPress: () => void;
}

export const AddNewAccountsButton: React.FC<AddNewAccountsButtonProps> =
  React.memo(({ onPress }) => {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={styles.addNewAccountsButton}
        activeOpacity={0.7}
      >
        <Text style={styles.addNewAccountsButtonText}>Add new accounts</Text>
      </TouchableOpacity>
    );
  });

AddNewAccountsButton.displayName = "AddNewAccountsButton";
