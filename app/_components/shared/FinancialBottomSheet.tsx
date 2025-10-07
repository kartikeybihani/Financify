import React, { useState, useEffect } from "react";
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
  PixelRatio,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { addNewBankAccount } from "@/app/_utils/plaid";
import InstitutionSelectionModal from "@/app/_components/modals/InstitutionSelectionModal";
import logger from "@/app/_utils/logger";

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
  initialExpandedCategory?: string;
  onAccountAdded?: () => void;
  onCashAdded?: () => void;
}

export default function FinancialBottomSheet({
  visible,
  onClose,
  title,
  icon,
  iconColor = "#4A90E2",
  categories,
  children,
  initialExpandedCategory,
  onAccountAdded,
  onCashAdded,
}: FinancialBottomSheetProps) {
  const { height, width } = useWindowDimensions();

  // Dynamic sizing based on screen dimensions
  const isSmallScreen = height < 700; // iPhone SE, iPhone 12 mini
  const isMediumScreen = height >= 700 && height < 800; // iPhone 12, iPhone 13
  const isLargeScreen = height >= 800; // iPhone 12 Pro Max, iPhone 13 Pro Max

  // Responsive dimensions
  const responsiveDimensions = {
    maxHeight: isSmallScreen ? height * 0.9 : height * 0.85,
    borderRadius: isSmallScreen ? 20 : 28,
    paddingHorizontal: isSmallScreen ? 16 : 24,
    paddingVertical: isSmallScreen ? 12 : 16,
    iconSize: isSmallScreen ? 18 : 20,
    titleFontSize: isSmallScreen ? 17 : 19,
    subtitleFontSize: isSmallScreen ? 12 : 13,
    categoryFontSize: isSmallScreen ? 12 : 13,
    buttonFontSize: isSmallScreen ? 14 : 15,
  };

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const [shouldReopenSheet, setShouldReopenSheet] = useState(false);

  // Handle initial expanded category when modal opens
  useEffect(() => {
    if (visible && initialExpandedCategory && categories) {
      const categoriesToExpand: string[] = [];

      if (initialExpandedCategory === "accounts") {
        // For accounts, expand CHECKINGS & SAVINGS if it has items
        const checkingsCategory = categories.find(
          (cat) => cat.title === "CHECKINGS & SAVINGS"
        );
        const cashCategory = categories.find((cat) => cat.title === "CASH");
        const realEstateCategory = categories.find(
          (cat) => cat.title === "REAL ESTATE"
        );

        if (checkingsCategory && checkingsCategory.items.length > 0) {
          categoriesToExpand.push(checkingsCategory.title);
          if (cashCategory && cashCategory.items.length > 0) {
            categoriesToExpand.push(cashCategory.title);
          }
          if (realEstateCategory && realEstateCategory.items.length > 0) {
            categoriesToExpand.push(realEstateCategory.title);
          }
        }
      } else if (initialExpandedCategory === "investments") {
        // For investments, expand INVESTMENTS if it has items
        const investmentsCategory = categories.find(
          (cat) => cat.title === "INVESTMENTS"
        );
        if (investmentsCategory && investmentsCategory.items.length > 0) {
          categoriesToExpand.push(investmentsCategory.title);
        }
      } else if (initialExpandedCategory === "liabilities") {
        // For liabilities, expand both CREDIT CARDS and LOANS if they have items
        const creditCardsCategory = categories.find(
          (cat) => cat.title === "CREDIT CARDS"
        );
        const loansCategory = categories.find((cat) => cat.title === "LOANS");

        if (creditCardsCategory && creditCardsCategory.items.length > 0) {
          categoriesToExpand.push(creditCardsCategory.title);
        }
        if (loansCategory && loansCategory.items.length > 0) {
          categoriesToExpand.push(loansCategory.title);
        }
      }

      // Set expanded categories if any were found with items
      if (categoriesToExpand.length > 0) {
        setExpandedCategories(new Set(categoriesToExpand));
      }
    } else if (!visible) {
      // Reset expanded categories when modal closes
      setExpandedCategories(new Set());
    }
  }, [visible, initialExpandedCategory, categories]);

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

    // If this is for cash, close the bottom sheet first, then trigger cash modal from parent
    const isCashCategory = categoryTitle?.toLowerCase().includes("cash");

    if (isCashCategory) {
      // Close the FinancialBottomSheet first
      onClose();

      // Then trigger cash modal from parent
      if (onCashAdded) {
        onCashAdded();
      }
      return;
    }

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
      logger.info(
        "🏦 User initiated add new bank account from FinancialBottomSheet"
      );

      await addNewBankAccount(
        (itemId) => {
          logger.info("✅ Successfully added new bank account:", itemId);

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
          logger.error("❌ Failed to add new bank account:", error);

          // Show error message
          Alert.alert(
            "Connection Failed",
            "We couldn't connect your bank account. Please try again or contact support if the issue persists.",
            [{ text: "Try Again", style: "default" }]
          );
        }
      );
    } catch (error) {
      logger.error("❌ Error in handleAddNewAccount:", error);
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
      logger.info(
        "🏦 User selected institution:",
        institutionId,
        "for investment account"
      );

      await addNewBankAccount(
        (itemId) => {
          logger.info("✅ Successfully added new investment account:", itemId);

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
          logger.error("❌ Failed to add investment account:", error);

          // Show error message
          Alert.alert(
            "Connection Failed",
            "We couldn't connect your investment account. Please try again or contact support if the issue persists.",
            [{ text: "Try Again", style: "default" }]
          );
        }
      );
    } catch (error) {
      logger.error("❌ Error in handleInstitutionSelect:", error);
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
      logger.info("🔄 Should reopen financial sheet");
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
            <View
              style={[
                styles.sheet,
                {
                  height: responsiveDimensions.maxHeight,
                  borderTopLeftRadius: responsiveDimensions.borderRadius,
                  borderTopRightRadius: responsiveDimensions.borderRadius,
                },
              ]}
            >
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>
              <View
                style={[
                  styles.header,
                  { paddingHorizontal: responsiveDimensions.paddingHorizontal },
                ]}
              >
                <View style={styles.titleContainer}>
                  <View
                    style={[
                      styles.iconContainer,
                      {
                        backgroundColor: "#1f1f1f",
                        width: isSmallScreen ? 36 : 42,
                        height: isSmallScreen ? 36 : 42,
                        borderRadius: isSmallScreen ? 18 : 21,
                      },
                    ]}
                  >
                    <Ionicons
                      name={icon}
                      size={responsiveDimensions.iconSize}
                      color={iconColor}
                    />
                  </View>
                  <View style={styles.titleTextContainer}>
                    <Text
                      style={[
                        styles.title,
                        { fontSize: responsiveDimensions.titleFontSize },
                      ]}
                    >
                      {title}
                    </Text>
                    <Text
                      style={[
                        styles.subtitle,
                        { fontSize: responsiveDimensions.subtitleFontSize },
                      ]}
                    >
                      Manage your financial accounts
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <LinearGradient
                    colors={[
                      "rgba(255, 255, 255, 0.15)",
                      "rgba(255, 255, 255, 0.05)",
                    ]}
                    style={[
                      styles.closeButtonCircle,
                      {
                        width: isSmallScreen ? 30 : 34,
                        height: isSmallScreen ? 30 : 34,
                        borderRadius: isSmallScreen ? 15 : 17,
                      },
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons
                      name="close"
                      size={responsiveDimensions.iconSize}
                      color="#fff"
                    />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.scrollContent,
                  { padding: responsiveDimensions.paddingVertical },
                ]}
              >
                {categories
                  ? categories.map((category, index) => (
                      <View key={index} style={styles.categoryContainer}>
                        <View style={styles.categoryHeader}>
                          <TouchableOpacity
                            onPress={() => toggleCategory(category.title)}
                            style={styles.categoryTitleContainer}
                          >
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
                            <Text
                              style={[
                                styles.categoryTitle,
                                {
                                  fontSize:
                                    responsiveDimensions.categoryFontSize,
                                },
                              ]}
                            >
                              {category.title}
                            </Text>
                          </TouchableOpacity>
                          <Text>{/* Total amount */}</Text>
                          <TouchableOpacity
                            onPress={() => handleAddNewAccount(category.title)}
                            disabled={isAddingAccount}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              opacity: isAddingAccount ? 0.6 : 1,
                            }}
                          >
                            <Text
                              style={[
                                styles.addActionText,
                                { fontSize: isSmallScreen ? 11 : 12 },
                              ]}
                            >
                              Add
                            </Text>
                            <AntDesign
                              name="right"
                              size={13}
                              color="#4A90E2"
                              style={{ marginLeft: 6 }}
                            />
                          </TouchableOpacity>
                        </View>
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
                                      fontSize: isSmallScreen ? 11 : 12,
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
                                      : category.title === "CASH"
                                      ? "ADD CASH MANUALLY"
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
              <View
                style={[
                  styles.footer,
                  { padding: responsiveDimensions.paddingHorizontal },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.addAccountButton,
                    {
                      opacity: isAddingAccount ? 0.6 : 1,
                      paddingVertical: isSmallScreen ? 12 : 14,
                      paddingHorizontal: isSmallScreen ? 18 : 22,
                    },
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
                    size={responsiveDimensions.iconSize}
                    color="#4A90E2"
                    style={styles.addIcon}
                  />
                  <Text
                    style={[
                      styles.addAccountText,
                      { fontSize: responsiveDimensions.buttonFontSize },
                    ]}
                  >
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
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontWeight: "600",
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  subtitle: {
    color: "#aaa",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  closeButtonContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  footer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  addAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(74, 144, 226, 0.08)",
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
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.2,
  },
  addActionText: {
    color: "#4A90E2",
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
    marginBottom: 2,
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
