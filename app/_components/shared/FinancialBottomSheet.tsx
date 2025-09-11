import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Dimensions,
  Animated,
  Alert,
  DeviceEventEmitter,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { addNewBankAccount, fetchInitialData } from "../../_utils/plaid";
import InstitutionSelectionModal from "../modals/InstitutionSelectionModal";

interface CategoryData {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  items: React.ReactNode[];
}

interface FinancialBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  categories?: CategoryData[];
  children?: React.ReactNode;
  onAccountAdded?: () => void;
}

export default function FinancialBottomSheet({
  visible,
  onClose,
  title,
  icon,
  iconColor = "#4A90E2",
  categories,
  children,
  onAccountAdded,
}: FinancialBottomSheetProps) {
  const { height } = useWindowDimensions();
  const maxHeight = height * 0.85;

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const [shouldReopenSheet, setShouldReopenSheet] = useState(false);

  const toggleCategory = (categoryTitle: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryTitle)) {
      newExpanded.delete(categoryTitle);
    } else {
      newExpanded.add(categoryTitle);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddNewAccount = async (categoryTitle?: string) => {
    if (isAddingAccount) return;

    // If this is for investments, show institution selection modal
    const isInvestmentCategory =
      categoryTitle?.toLowerCase().includes("investment") ||
      categoryTitle?.toLowerCase().includes("invest") ||
      categoryTitle?.toLowerCase().includes("brokerage") ||
      categoryTitle?.toLowerCase().includes("portfolio");

    if (isInvestmentCategory) {
      setShowInstitutionModal(true);
      setShouldReopenSheet(true);
      // Also close the bottom sheet to avoid modal conflicts
      onClose();
      return;
    }

    setIsAddingAccount(true);

    try {
      console.log(
        "🏦 User initiated add new bank account from FinancialBottomSheet"
      );

      await addNewBankAccount(
        (itemId) => {
          console.log("✅ Successfully added new bank account:", itemId);

          // Close the bottom sheet
          onClose();

          // Trigger data refresh
          DeviceEventEmitter.emit("financialDataRefreshed");

          // Call the optional callback
          onAccountAdded?.();

          // Show success message
          Alert.alert(
            "Success! 🎉",
            "Your new bank account has been connected successfully. Your financial data is now being updated.",
            [{ text: "Great!", style: "default" }]
          );
        },
        (error) => {
          console.error("❌ Failed to add new bank account:", error);

          // Show error message
          Alert.alert(
            "Connection Failed",
            "We couldn't connect your bank account. Please try again or contact support if the issue persists.",
            [{ text: "Try Again", style: "default" }]
          );
        }
      );
    } catch (error) {
      console.error("❌ Error in handleAddNewAccount:", error);
      Alert.alert("Error", "Something went wrong. Please try again.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleInstitutionSelect = async (institutionId: string) => {
    setShowInstitutionModal(false);
    setShouldReopenSheet(false); // Don't reopen after selection

    if (isAddingAccount) return;
    setIsAddingAccount(true);

    try {
      console.log(
        "🏦 User selected institution:",
        institutionId,
        "for investment account"
      );

      await addNewBankAccount(
        (itemId) => {
          console.log("✅ Successfully added new investment account:", itemId);

          // Close the bottom sheet
          onClose();

          // Trigger data refresh
          DeviceEventEmitter.emit("financialDataRefreshed");

          // Call the optional callback
          onAccountAdded?.();

          // Show success message
          Alert.alert(
            "Success! 🎉",
            "Your investment account has been connected successfully. Your financial data is now being updated.",
            [{ text: "Great!", style: "default" }]
          );
        },
        (error) => {
          console.error("❌ Failed to add investment account:", error);

          // Show error message
          Alert.alert(
            "Connection Failed",
            "We couldn't connect your investment account. Please try again or contact support if the issue persists.",
            [{ text: "Try Again", style: "default" }]
          );
        }
      );
    } catch (error) {
      console.error("❌ Error in handleInstitutionSelect:", error);
      Alert.alert("Error", "Something went wrong. Please try again.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleReopenFinancialSheet = () => {
    if (shouldReopenSheet) {
      setShouldReopenSheet(false);
      // This will be handled by the parent component that manages the FinancialBottomSheet visibility
      // For now, we'll just log it
      console.log("🔄 Should reopen financial sheet");
    }
  };

  return (
    <>
      <InstitutionSelectionModal
        visible={showInstitutionModal}
        onClose={() => setShowInstitutionModal(false)}
        onInstitutionSelect={handleInstitutionSelect}
        onReopenFinancialSheet={handleReopenFinancialSheet}
      />
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.overlay}>
          <BlurView
            intensity={25}
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
          <View style={styles.modalContainer}>
            <View style={[styles.sheet, { height: maxHeight }]}>
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <View style={styles.titleContainer}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: "#1f1f1f" },
                    ]}
                  >
                    <Ionicons name={icon} size={20} color={iconColor} />
                  </View>
                  <View style={styles.titleTextContainer}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>
                      Manage your financial accounts
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <View style={styles.closeButtonContainer}>
                    <Ionicons name="close" size={20} color="#888" />
                  </View>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {categories
                  ? categories.map((category, index) => (
                      <View key={index} style={styles.categoryContainer}>
                        <TouchableOpacity
                          style={styles.categoryHeader}
                          onPress={() => toggleCategory(category.title)}
                        >
                          <View style={styles.categoryTitleContainer}>
                            <Ionicons
                              name={
                                expandedCategories.has(category.title)
                                  ? "caret-down"
                                  : "caret-forward"
                              }
                              size={16}
                              color="#888"
                              style={styles.categoryCaretIcon}
                            />
                            <Text style={styles.categoryTitle}>
                              {category.title}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        {expandedCategories.has(category.title) && (
                          <View style={styles.categoryContent}>
                            {category.items.length > 0 ? (
                              category.items.map((item, itemIndex) => (
                                <View
                                  key={itemIndex}
                                  style={styles.categoryItem}
                                >
                                  {item}
                                </View>
                              ))
                            ) : (
                              <View style={styles.emptyState}>
                                {/* <Text style={styles.emptyStateText}>
                                No {category.title.toLowerCase()} found
                              </Text> */}
                                <TouchableOpacity
                                  style={{
                                    flexDirection: "row",
                                    opacity: isAddingAccount ? 0.6 : 1,
                                  }}
                                  onPress={() =>
                                    handleAddNewAccount(category.title)
                                  }
                                  disabled={isAddingAccount}
                                >
                                  <Ionicons
                                    name={
                                      isAddingAccount
                                        ? "hourglass-outline"
                                        : "add-circle-outline"
                                    }
                                    size={16}
                                    color="#4A90E2"
                                    style={{ marginRight: 4 }}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "600",
                                      color: "#4A90E2",
                                      fontFamily:
                                        Platform.OS === "ios"
                                          ? "System"
                                          : "sans-serif",
                                      letterSpacing: 0.2,
                                    }}
                                  >
                                    {isAddingAccount
                                      ? "CONNECTING..."
                                      : "ADD A NEW ACCOUNT"}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    ))
                  : children}
              </ScrollView>
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[
                    styles.addAccountButton,
                    { opacity: isAddingAccount ? 0.6 : 1 },
                  ]}
                  onPress={() => handleAddNewAccount()}
                  disabled={isAddingAccount}
                >
                  <Ionicons
                    name={
                      isAddingAccount
                        ? "hourglass-outline"
                        : "add-circle-outline"
                    }
                    size={20}
                    color="#4A90E2"
                    style={styles.addIcon}
                  />
                  <Text style={styles.addAccountText}>
                    {isAddingAccount ? "Connecting..." : "Link a New Account"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    backgroundColor: "transparent",
  },
  sheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  handleContainer: {
    width: "100%",
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingTop: 10,
  },
  titleTextContainer: {
    flex: 1,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 19,
    fontWeight: "600",
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#aaa",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  footer: {
    padding: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  addAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(74, 144, 226, 0.08)",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  addIcon: {
    marginRight: 8,
  },
  addAccountText: {
    color: "#4A90E2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  categoryContainer: {
    marginBottom: 22,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    // backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderBottomWidth: 0.7,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  categoryTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryCaretIcon: {
    marginRight: 8,
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    flex: 1,
    letterSpacing: 0.6,
  },
  categoryCount: {
    fontSize: 14,
    fontWeight: "500",
    color: "#888",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    marginLeft: 8,
  },
  categoryContent: {
    marginTop: 0,
    paddingLeft: 6,
  },
  categoryItem: {
    marginBottom: 8,
  },
  emptyState: {
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    marginTop: 5,
    borderStyle: "dashed",
  },
  emptyStateText: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
});
