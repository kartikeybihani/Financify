import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ModalBlurOverlay,
  ModalHandle,
  ModalHeader,
} from "../shared/modal-components";
import { MODAL_SHARED_STYLES as styles } from "@/app/_components/shared/modal-styles";

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
  const handleCategoryPress = (categoryId: string) => {
    onCategorySelect(categoryId);
    onClose();
  };

  const renderCategoryCard = (category: (typeof categories)[0]) => {
    return (
      <TouchableOpacity
        key={category.id}
        style={styles.categoryCard}
        onPress={() => handleCategoryPress(category.id)}
        activeOpacity={0.7}
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
            <ModalHeader title="Select Account Type" onClose={onClose} />
            <View style={styles.content}>
              <View style={styles.categoriesGrid}>
                {categories.map((category) => renderCategoryCard(category))}
              </View>
            </View>
          </View>
        </View>
      </ModalBlurOverlay>
    </Modal>
  );
}
