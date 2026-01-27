import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
  TouchableWithoutFeedback,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase/supabase";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { API_BASE_URL } from "@/src/utils/core/apiUrl";
import logger from "@/src/utils/core/logger";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface BudgetCategory {
  name: string;
  icon: string;
  limit: number;
}

interface BudgetCreationModalProps {
  visible: boolean;
  onClose: () => void;
  onBudgetCreated: () => void;
}

export default function BudgetCreationModal({
  visible,
  onClose,
  onBudgetCreated,
}: BudgetCreationModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [income, setIncome] = useState("");
  const [savings, setSavings] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCategories, setGeneratedCategories] = useState<
    BudgetCategory[]
  >([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const sheetHeightAnim = useRef(new Animated.Value(0)).current;
  const didInitSheetHeightRef = useRef(false);

  const handleStart = async () => {
    const incomeValue = parseFloat(income.trim());
    if (isNaN(incomeValue) || incomeValue <= 0) {
      setError("Please enter a valid income amount");
      return;
    }

    setError(null);
    setLoading(true);
    setStep(2);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Call API to generate budget
      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/transactions_sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create_budget",
            income: incomeValue,
            savingsAmount: savings.trim() ? parseFloat(savings.trim()) : null,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.categories && Array.isArray(data.categories)) {
        setGeneratedCategories(data.categories);
        setStep(3);
      } else {
        throw new Error("Invalid response format from API");
      }
    } catch (err) {
      logger.error("[BUDGET] Error creating budget with Finny:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create budget. Please try again.",
      );
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBudget = async () => {
    if (generatedCategories.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Call API to save budget
      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/transactions_sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create_budget",
            income: parseFloat(income.trim()),
            savingsAmount: savings.trim() ? parseFloat(savings.trim()) : null,
            categories: generatedCategories,
            save: true, // Flag to save to database
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      logger.info("[BUDGET] Budget created successfully with Finny");
      onBudgetCreated();
      handleClose();
    } catch (err) {
      logger.error("[BUDGET] Error saving budget:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save budget. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setIncome("");
    setSavings("");
    setError(null);
    setGeneratedCategories([]);
    setLoading(false);
    onClose();
  };

  // Dynamically size the sheet based on its content
  useEffect(() => {
    if (!visible) {
      sheetHeightAnim.setValue(0);
      didInitSheetHeightRef.current = false;
      return;
    }

    const maxSheetHeight = Math.max(
      320,
      SCREEN_HEIGHT - Math.max(insets.top, 12) - 12,
    );
    const minSheetHeight = Math.min(
      maxSheetHeight,
      Math.max(380, SCREEN_HEIGHT * 0.55),
    );

    const measuredTotal = (headerHeight || 0) + (scrollContentHeight || 0);

    const target = Math.max(
      minSheetHeight,
      Math.min(
        maxSheetHeight,
        measuredTotal > 0 ? measuredTotal : minSheetHeight,
      ),
    );

    if (!didInitSheetHeightRef.current) {
      didInitSheetHeightRef.current = true;
      sheetHeightAnim.setValue(minSheetHeight);
    }

    Animated.spring(sheetHeightAnim, {
      toValue: target,
      damping: 26,
      stiffness: 240,
      mass: 1,
      useNativeDriver: false,
    }).start();
  }, [visible, headerHeight, scrollContentHeight, insets.top, sheetHeightAnim]);

  const incomeValue = parseFloat(income.trim());
  const isValidIncome = !isNaN(incomeValue) && incomeValue > 0;

  const maxSheetHeight = Math.max(
    320,
    SCREEN_HEIGHT - Math.max(insets.top, 12) - 12,
  );
  const minSheetHeight = Math.min(
    maxSheetHeight,
    Math.max(380, SCREEN_HEIGHT * 0.55),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.contentWrapper,
                {
                  height: sheetHeightAnim,
                  minHeight: minSheetHeight,
                  maxHeight: maxSheetHeight,
                },
              ]}
            >
              <LinearGradient
                colors={["rgba(31, 31, 31, 0.98)", "rgba(18, 18, 18, 0.99)"]}
                style={styles.content}
              >
                <View style={styles.sheetHandleContainer}>
                  <View style={styles.sheetHandle} />
                </View>

                {/* Header */}
                <View
                  style={styles.header}
                  onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
                >
                  <View style={styles.headerLeft}>
                    <Text style={styles.title}>
                      {step === 1
                        ? "Create Budget with Finny"
                        : step === 2
                          ? "Finny is analyzing..."
                          : "Review Your Budget"}
                    </Text>
                    {step === 1 && (
                      <Text style={styles.subtitle}>
                        Tell Finny about your income and savings goals
                      </Text>
                    )}
                  </View>
                  {step !== 2 && (
                    <TouchableOpacity
                      onPress={handleClose}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Step 1: Input Form */}
                {step === 1 && (
                  <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[
                      styles.scrollContent,
                      {
                        paddingBottom: Math.max(
                          20,
                          (insets.bottom || 0) + SCREEN_HEIGHT * 0.02,
                        ),
                      },
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    onContentSizeChange={(_, h) => setScrollContentHeight(h)}
                  >
                    <View style={styles.form}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>Monthly Income *</Text>
                        <View style={styles.inputContainer}>
                          <Text style={styles.dollarSign}>$</Text>
                          <TextInput
                            style={styles.input}
                            value={income}
                            onChangeText={setIncome}
                            placeholder="0"
                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            keyboardType="decimal-pad"
                            autoFocus
                          />
                        </View>
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                          Monthly Savings{" "}
                          <Text style={styles.optional}>(optional)</Text>
                        </Text>
                        <View style={styles.inputContainer}>
                          <Text style={styles.dollarSign}>$</Text>
                          <TextInput
                            style={styles.input}
                            value={savings}
                            onChangeText={setSavings}
                            placeholder="0"
                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <Text style={styles.hint}>
                          How much do you want to save each month?
                        </Text>
                      </View>

                      {error && (
                        <View style={styles.errorContainer}>
                          <Ionicons
                            name="alert-circle"
                            size={20}
                            color="#FF6B6B"
                          />
                          <Text style={styles.errorText}>{error}</Text>
                        </View>
                      )}

                      <TouchableOpacity
                        onPress={handleStart}
                        style={[
                          styles.continueButton,
                          (!isValidIncome || loading) &&
                            styles.continueButtonDisabled,
                        ]}
                        disabled={!isValidIncome || loading}
                      >
                        <LinearGradient
                          colors={
                            isValidIncome && !loading
                              ? ["#4A90E2", "#5DA0F2"]
                              : ["#666", "#888"]
                          }
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.continueButtonGradient}
                        >
                          <Text style={styles.continueButtonText}>
                            Continue
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                )}

                {/* Step 2: Loading State */}
                {step === 2 && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#4A90E2" />
                    <Text style={styles.loadingText}>
                      Finny is analyzing your spending patterns...
                    </Text>
                    <Text style={styles.loadingSubtext}>
                      This may take a few moments
                    </Text>
                  </View>
                )}

                {/* Step 3: Review & Confirm */}
                {step === 3 && (
                  <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[
                      styles.scrollContent,
                      {
                        paddingBottom: Math.max(
                          20,
                          (insets.bottom || 0) + SCREEN_HEIGHT * 0.02,
                        ),
                      },
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    onContentSizeChange={(_, h) => setScrollContentHeight(h)}
                  >
                    <Text style={styles.reviewTitle}>
                      Finny created a personalized budget for you
                    </Text>
                    <Text style={styles.reviewSubtitle}>
                      Review and adjust if needed, then create your budget
                    </Text>

                    <View style={styles.categoriesList}>
                      {generatedCategories.map((category, index) => (
                        <View key={index} style={styles.categoryItem}>
                          <View style={styles.categoryLeft}>
                            <Text style={styles.categoryIcon}>
                              {category.icon}
                            </Text>
                            <Text style={styles.categoryName}>
                              {category.name}
                            </Text>
                          </View>
                          <Text style={styles.categoryLimit}>
                            ${category.limit.toLocaleString()}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {error && (
                      <View style={styles.errorContainer}>
                        <Ionicons
                          name="alert-circle"
                          size={20}
                          color="#FF6B6B"
                        />
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={handleCreateBudget}
                      style={[
                        styles.createButton,
                        loading && styles.createButtonDisabled,
                      ]}
                      disabled={loading}
                    >
                      <LinearGradient
                        colors={
                          loading ? ["#666", "#888"] : ["#4A90E2", "#5DA0F2"]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.createButtonGradient}
                      >
                        <Text style={styles.createButtonText}>
                          {loading ? "Creating..." : "Create Budget"}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </LinearGradient>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  contentWrapper: {
    width: SCREEN_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 24,
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: SCREEN_WIDTH,
    flexDirection: "column" as const,
    overflow: "hidden",
    flex: 1,
  },
  sheetHandleContainer: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 44,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    flexShrink: 0,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Manrope",
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Math.max(20, SCREEN_WIDTH * 0.05),
    flexGrow: 1,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    fontFamily: "Manrope",
  },
  optional: {
    fontSize: 13,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.5)",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4A90E2",
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
    padding: 0,
  },
  hint: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    fontFamily: "Manrope",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#FF6B6B",
    fontFamily: "Manrope",
  },
  continueButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    minHeight: 200,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
    marginTop: 24,
    textAlign: "center",
  },
  loadingSubtext: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.5)",
    fontFamily: "Manrope",
    marginTop: 8,
    textAlign: "center",
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    marginBottom: 8,
    textAlign: "center",
  },
  reviewSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Manrope",
    marginBottom: 24,
    textAlign: "center",
  },
  categoriesList: {
    gap: 12,
    marginBottom: 24,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
  },
  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  categoryIcon: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
  categoryLimit: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4A90E2",
    fontFamily: "Manrope",
  },
  createButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
});
