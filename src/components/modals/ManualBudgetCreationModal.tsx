import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import CategoryBudgetInputModal from "./CategoryBudgetInputModal";

interface Category {
  name: string;
  icon: string;
  slug: string;
}

const COMMON_CATEGORIES: Category[] = [
  { name: "Groceries", icon: "🛒", slug: "groceries" },
  { name: "Food & Dining", icon: "🍔", slug: "food-dining" },
  { name: "Housing", icon: "🏠", slug: "housing" },
  { name: "Transportation", icon: "🚗", slug: "transportation" },
  { name: "Auto", icon: "🚙", slug: "auto" },
  { name: "Insurance", icon: "🛡️", slug: "insurance" },
  { name: "Shopping", icon: "🛍️", slug: "shopping" },
  { name: "Entertainment", icon: "🎬", slug: "entertainment" },
  { name: "Health", icon: "💪", slug: "health" },
  { name: "Travel", icon: "✈️", slug: "travel" },
  { name: "Personal Care", icon: "💄", slug: "personal-care" },
  { name: "Savings", icon: "💎", slug: "savings" },
  { name: "Utilities", icon: "⚡", slug: "utilities" },
  { name: "Subscriptions", icon: "📱", slug: "subscriptions" },
  { name: "Education", icon: "📚", slug: "education" },
  { name: "Gifts & Donations", icon: "🎁", slug: "gifts-donations" },
  { name: "Pets", icon: "🐾", slug: "pets" },
  { name: "Other", icon: "📦", slug: "other" },
];

interface ManualBudgetCreationModalProps {
  visible: boolean;
  onClose: () => void;
  onBudgetCreated: () => void;
}

export default function ManualBudgetCreationModal({
  visible,
  onClose,
  onBudgetCreated,
}: ManualBudgetCreationModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [categoriesWithBudget, setCategoriesWithBudget] = useState<Set<string>>(
    new Set(),
  );

  const handleCategoryPress = (category: Category) => {
    setSelectedCategory(category);
  };

  const handleBudgetCreated = () => {
    if (selectedCategory) {
      setCategoriesWithBudget((prev) =>
        new Set(prev).add(selectedCategory.slug),
      );
    }
    setSelectedCategory(null);
    onBudgetCreated();
  };

  const handleDone = () => {
    onClose();
    setSelectedCategory(null);
    setCategoriesWithBudget(new Set());
  };

  return (
    <>
      <Modal
        visible={visible && !selectedCategory}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={["#1a1a1a", "#0f0f0f"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.modalContent}
            >
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>Create Budget Manually</Text>
                  <Text style={styles.subtitle}>
                    Select categories and set your monthly budget
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
              >
                <View style={styles.categoriesRow}>
                  {COMMON_CATEGORIES.map((category, index) => {
                    const hasBudget = categoriesWithBudget.has(category.slug);
                    const isLastInRow = (index + 1) % 3 === 0;
                    return (
                      <TouchableOpacity
                        key={category.slug}
                        onPress={() => handleCategoryPress(category)}
                        activeOpacity={0.8}
                        style={[
                          styles.categoryCard,
                          hasBudget && styles.categoryCardWithBudget,
                          isLastInRow && styles.categoryCardLastInRow,
                        ]}
                      >
                        <View style={styles.categoryContent}>
                          {hasBudget ? (
                            <View style={styles.checkmarkContainer}>
                              <Ionicons
                                name="checkmark-circle"
                                size={24}
                                color="#4A90E2"
                              />
                            </View>
                          ) : (
                            <View style={styles.plusButton}>
                              <AntDesign
                                name="plus-circle"
                                size={24}
                                color="#4A90E2"
                              />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.categoryName,
                              hasBudget && styles.categoryNameWithBudget,
                            ]}
                            numberOfLines={2}
                          >
                            {category.name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity
                  onPress={handleDone}
                  style={styles.doneButton}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={["#4A90E2", "#5DA0F2"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.doneButtonGradient}
                  >
                    <Text style={styles.doneButtonText}>Done</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <CategoryBudgetInputModal
        visible={!!selectedCategory}
        category={selectedCategory || COMMON_CATEGORIES[0]}
        onClose={() => setSelectedCategory(null)}
        onBudgetCreated={handleBudgetCreated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "80%",
    maxHeight: "80%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  modalContent: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Manrope",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  categoryCard: {
    width: "31%",
    minWidth: 100,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    alignItems: "center",
    marginRight: 12,
    marginBottom: 12,
  },
  categoryCardLastInRow: {
    marginRight: 0,
  },
  categoryCardWithBudget: {
    borderColor: "rgba(74, 144, 226, 0.5)",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  categoryContent: {
    alignItems: "center",
    width: "100%",
  },
  plusButton: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  checkmarkContainer: {
    marginBottom: 8,
  },
  finnyImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  finnyImage: {
    width: "100%",
    height: "100%",
  },
  categoryName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
    textAlign: "center",
  },
  categoryNameWithBudget: {
    color: "#4A90E2",
  },
  footer: {
    padding: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  doneButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  doneButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
});
