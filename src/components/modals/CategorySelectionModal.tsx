import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import {
  ModalBlurOverlay,
  ModalHandle,
  ModalHeader,
} from "../shared/modal-components";
import { MODAL_SHARED_STYLES as styles } from "@/src/styles/modalStyles";
import { useDemoMode } from "@/src/contexts/DemoContext";
import logger from "@/src/utils/core/logger";

interface CategorySelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onCategorySelect: (category: string) => void;
}

const categories = [
  {
    id: "cash_deposit",
    name: "Cash Deposit",
    icon: "💰",
    color: "#4A90E2",
    description: "Checking & Savings",
  },
  {
    id: "liabilities",
    name: "Liabilities",
    icon: "💳",
    color: "#9B59B6",
    description: "Credit Cards & Loans",
  },
  {
    id: "investments",
    name: "Investments",
    icon: "📈",
    color: "#4ECDC4",
    description: "Investment Accounts",
  },
  {
    id: "retirement",
    name: "Retirement",
    icon: "🏖️",
    color: "#FFA726",
    description: "401k & IRAs",
  },
];

export default function CategorySelectionModal({
  visible,
  onClose,
  onCategorySelect,
}: CategorySelectionModalProps) {
  const { isDemoMode } = useDemoMode();

  const handleCategoryPress = (categoryId: string) => {
    // Don't allow category selection in demo mode
    if (isDemoMode) {
      return;
    }
    onCategorySelect(categoryId);
    onClose();
  };

  const renderCategoryCard = (category: (typeof categories)[0]) => {
    return (
      <TouchableOpacity
        key={category.id}
        style={styles.categoryCard}
        onPress={() => handleCategoryPress(category.id)}
        activeOpacity={isDemoMode ? 1 : 0.7}
        disabled={isDemoMode}
      >
        <LinearGradient
          colors={[`${category.color}20`, `${category.color}10`]}
          style={styles.categoryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.categoryContent}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: `${category.color}20` },
              ]}
            >
              <Text style={{ fontSize: 28 }}>{category.icon}</Text>
            </View>
            <Text style={styles.categoryTitle}>{category.name}</Text>
            <Text style={styles.categoryDescription}>
              {category.description}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <ModalBlurOverlay onPressOutside={onClose}>
        <View style={styles.modalContainer}>
          <View style={styles.sheet}>
            <ModalHandle />
            <ModalHeader title="Add a new account" onClose={onClose} />
            <View style={styles.content}>
              <View style={styles.categoriesGrid}>
                {categories.map((category) => renderCategoryCard(category))}
              </View>

              {/* Safety link */}
              <TouchableOpacity
                style={safetyStyles.safetyLinkButton}
                onPress={async () => {
                  try {
                    await WebBrowser.openBrowserAsync(
                      "https://www.usefinny.com/safety",
                      {
                        presentationStyle:
                          WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                        controlsColor: "#4A90E2",
                        showTitle: true,
                      },
                    );
                  } catch (error) {
                    Alert.alert("Error", "Cannot open safety page");
                    logger.error("Failed to open safety page:", error);
                  }
                }}
              >
                <Text style={safetyStyles.safetyLinkText}>
                  Learn more about Finny's safety commitment
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ModalBlurOverlay>
    </Modal>
  );
}

const safetyStyles = StyleSheet.create({
  safetyLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingVertical: 8,
  },
  safetyLinkText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    textDecorationLine: "underline",
  },
});
