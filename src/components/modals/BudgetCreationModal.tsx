import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase/supabase";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { API_BASE_URL } from "@/src/utils/core/apiUrl";
import logger from "@/src/utils/core/logger";
import CategoryMappingModal from "./CategoryMappingModal";

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
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const sheetHeightAnim = useRef(new Animated.Value(0)).current;
  const didInitSheetHeightRef = useRef(false);
  const step2PulseAnim = useRef(new Animated.Value(0)).current;
  const step2RotationAnim = useRef(new Animated.Value(0)).current;
  const step2ScaleAnim = useRef(new Animated.Value(1)).current;
  const categoryAnimations = useRef<Animated.Value[]>([]).current;

  // Initialize category animations when categories are set
  useEffect(() => {
    if (generatedCategories.length > 0) {
      // Ensure we have enough animation values
      while (categoryAnimations.length < generatedCategories.length) {
        categoryAnimations.push(new Animated.Value(0));
      }
      // Reset and animate categories in sequence
      categoryAnimations
        .slice(0, generatedCategories.length)
        .forEach((anim, index) => {
          anim.setValue(0);
          Animated.sequence([
            Animated.delay(index * 100),
            Animated.spring(anim, {
              toValue: 1,
              damping: 15,
              stiffness: 200,
              useNativeDriver: true,
            }),
          ]).start();
        });
    }
  }, [generatedCategories]);

  // Step 2 animation loop
  useEffect(() => {
    if (step === 2) {
      // Reset animations
      step2PulseAnim.setValue(0);
      step2RotationAnim.setValue(0);
      step2ScaleAnim.setValue(1);

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(step2PulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(step2PulseAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ).start();

      // Rotation animation
      Animated.loop(
        Animated.timing(step2RotationAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ).start();

      // Scale animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(step2ScaleAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(step2ScaleAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      step2PulseAnim.stopAnimation();
      step2RotationAnim.stopAnimation();
      step2ScaleAnim.stopAnimation();
    }
  }, [step]);

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
      
      // Show mapping modal
      setCurrentUserId(user.id);
      setShowMappingModal(true);
      
      // Don't close the main modal yet - let mapping modal handle it
      // onBudgetCreated will be called after mapping completes
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

  // Check for draft budget when modal opens
  useEffect(() => {
    if (visible) {
      checkForDraftBudget();
    } else {
      // Reset state when modal closes (but keep categories in case user reopens)
      setStep(1);
      setIncome("");
      setSavings("");
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  const checkForDraftBudget = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        return;
      }

      setLoading(true);
      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/transactions_sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "check_draft_budget",
          }),
        },
      );

      if (!response.ok) {
        // No draft found or error - start fresh
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (data.hasDraft && data.categories && data.categories.length > 0) {
        // Load draft and go to step 3
        setGeneratedCategories(data.categories);
        setStep(3);
      }
    } catch (err) {
      logger.error("[BUDGET] Error checking draft budget:", err);
      // Start fresh on error
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setIncome("");
    setSavings("");
    setError(null);
    setGeneratedCategories([]);
    // Delete draft budget
    deleteDraftBudget();
  };

  const deleteDraftBudget = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        return;
      }

      // Find and delete draft period
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const periodStart = new Date(year, month, 1);
      const periodEnd = new Date(year, month + 1, 0);

      const formatLocalDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };

      const periodStartStr = formatLocalDate(periodStart);
      const periodEndStr = formatLocalDate(periodEnd);

      const { data: draftPeriod } = await supabase
        .from("budget_periods")
        .select("id")
        .eq("user_id", user.id)
        .eq("period_start", periodStartStr)
        .eq("period_end", periodEndStr)
        .eq("status", "draft")
        .maybeSingle();

      if (draftPeriod) {
        // Clear budget_analysis and delete entries first
        await supabase
          .from("budget_periods")
          .update({ budget_analysis: null })
          .eq("id", draftPeriod.id);

        await supabase
          .from("budget_entries")
          .delete()
          .eq("budget_period_id", draftPeriod.id);

        // Delete period
        await supabase.from("budget_periods").delete().eq("id", draftPeriod.id);
      }
    } catch (err) {
      logger.error("[BUDGET] Error deleting draft budget:", err);
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

    const target = maxSheetHeight;

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
  }, [visible, headerHeight, insets.top, sheetHeightAnim]);

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
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close budget creation modal"
        />
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
            {step !== 3 && (
              <View
                style={styles.header}
                onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
              >
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>
                    {step === 1
                      ? "Create Budget with Finny"
                      : "Finny is analyzing..."}
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
            )}

            {/* Step 1: Input Form */}
            {step === 1 && (
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
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
                        keyboardType="number-pad"
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
                      <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
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
                      <Text style={styles.continueButtonText}>Continue</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Step 2: Loading State with Premium Animation */}
            {step === 2 && (
              <View style={styles.loadingContainer}>
                <View style={styles.loadingAnimationContainer}>
                  {/* Outer rotating ring */}
                  <Animated.View
                    style={[
                      styles.loadingRing,
                      {
                        transform: [
                          {
                            rotate: step2RotationAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ["0deg", "360deg"],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.loadingRingInner} />
                  </Animated.View>

                  {/* Middle pulsing circle */}
                  <Animated.View
                    style={[
                      styles.loadingCircle,
                      {
                        opacity: step2PulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.3, 1],
                        }),
                        transform: [
                          {
                            scale: step2ScaleAnim,
                          },
                        ],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={["#4A90E2", "#5DA0F2"]}
                      style={styles.loadingCircleGradient}
                    />
                  </Animated.View>

                  {/* Inner icon */}
                  <View style={styles.loadingIconContainer}>
                    <Ionicons name="sparkles" size={32} color="#4A90E2" />
                  </View>
                </View>

                <Animated.Text
                  style={[
                    styles.loadingText,
                    {
                      opacity: step2PulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.7, 1],
                      }),
                    },
                  ]}
                >
                  Finny is analyzing your spending patterns...
                </Animated.Text>
                <Text style={styles.loadingSubtext}>
                  This may take a few moments
                </Text>

                {/* Animated dots */}
                <View style={styles.loadingDots}>
                  {[0, 1, 2].map((index) => (
                    <Animated.View
                      key={index}
                      style={[
                        styles.loadingDot,
                        {
                          opacity: step2PulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.3, 1],
                          }),
                          transform: [
                            {
                              scale: step2PulseAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.8, 1.2],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Step 3: Review & Confirm */}
            {step === 3 && (
              <View style={styles.step3Container}>
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
                  showsVerticalScrollIndicator={true}
                  indicatorStyle="white"
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  nestedScrollEnabled={true}
                  bounces={true}
                  scrollEnabled={true}
                  alwaysBounceVertical={false}
                >
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewTitleRow}>
                      <Text style={styles.reviewTitle}>
                        Your personalized budget
                      </Text>
                      <TouchableOpacity
                        onPress={handleClose}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.reviewSubtitle}>
                      Review and adjust if needed, then create your budget
                    </Text>
                  </View>

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalAmount}>
                      $
                      {generatedCategories
                        .reduce((sum, c) => sum + c.limit, 0)
                        .toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.categoriesList}>
                    {generatedCategories.map((category, index) => {
                      const anim =
                        categoryAnimations[index] || new Animated.Value(1);
                      return (
                        <Animated.View
                          key={index}
                          style={[
                            styles.categoryItem,
                            {
                              opacity: anim,
                              transform: [
                                {
                                  translateY: anim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [20, 0],
                                  }),
                                },
                                {
                                  scale: anim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.95, 1],
                                  }),
                                },
                              ],
                            },
                          ]}
                        >
                          <LinearGradient
                            colors={[
                              "rgba(74, 144, 226, 0.06)",
                              "rgba(93, 160, 242, 0.03)",
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.categoryItemGradient}
                          >
                            <View style={styles.categoryLeft}>
                              <View style={styles.categoryIconContainer}>
                                <Text style={styles.categoryIcon}>
                                  {category.icon}
                                </Text>
                              </View>
                              <View style={styles.categoryInfo}>
                                <Text style={styles.categoryName}>
                                  {category.name}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.categoryRight}>
                              <Text style={styles.categoryLimit}>
                                ${category.limit.toLocaleString()}
                              </Text>
                              <View style={styles.categoryLimitUnderline} />
                            </View>
                          </LinearGradient>
                        </Animated.View>
                      );
                    })}
                  </View>

                  {error && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <View style={styles.step3Actions}>
                    <TouchableOpacity
                      onPress={handleStartOver}
                      style={styles.startOverButton}
                      disabled={loading}
                    >
                      <Ionicons
                        name="refresh"
                        size={18}
                        color="rgba(255, 255, 255, 0.7)"
                      />
                      <Text style={styles.startOverButtonText}>Start Over</Text>
                    </TouchableOpacity>

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
                          loading
                            ? ["#666", "#888"]
                            : ["#4A90E2", "#5DA0F2", "#6BB0FF"]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.createButtonGradient}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#fff"
                          style={styles.createButtonIcon}
                        />
                        <Text style={styles.createButtonText}>
                          {loading ? "Creating..." : "Create Budget"}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </View>
      
      {/* Category Mapping Modal */}
      {currentUserId && (
        <CategoryMappingModal
          visible={showMappingModal}
          userId={currentUserId}
          onComplete={() => {
            setShowMappingModal(false);
            setCurrentUserId(null);
            onBudgetCreated();
            handleClose();
          }}
        />
      )}
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
    minHeight: 0,
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: SCREEN_WIDTH,
    flexDirection: "column" as const,
    overflow: "hidden",
    flex: 1,
    minHeight: 0,
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
    minHeight: 0,
    flexShrink: 1,
  },
  scrollContent: {
    padding: Math.max(20, SCREEN_WIDTH * 0.05),
    flexGrow: 1,
  },
  step3Container: {
    flex: 1,
    minHeight: 0,
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
  loadingAnimationContainer: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 8,
  },
  loadingRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderTopColor: "#4A90E2",
    borderRightColor: "#5DA0F2",
    borderBottomColor: "#6BB0FF",
    borderLeftColor: "transparent",
    opacity: 0.6,
  },
  loadingRingInner: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
  },
  loadingCircle: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  loadingCircleGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
    opacity: 0.4,
  },
  loadingIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  loadingDots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
    alignItems: "center",
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A90E2",
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
  reviewHeader: {
    alignItems: "center",
    marginBottom: 32,
    paddingTop: 8,
  },
  reviewTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  reviewTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    letterSpacing: -0.3,
    paddingRight: 8,
  },
  reviewSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Manrope",
    lineHeight: 18,
    alignSelf: "stretch",
    textAlign: "left",
  },
  categoriesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
    fontFamily: "Manrope",
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A90E2",
    fontFamily: "Manrope",
    letterSpacing: -0.3,
  },
  categoryItem: {
    flex: 1,
    minWidth: "47%",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryItemGradient: {
    padding: 10,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  },
  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  categoryIconContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
    letterSpacing: -0.2,
  },
  categoryRight: {
    alignItems: "flex-start",
    width: "100%",
  },
  categoryLimit: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4A90E2",
    fontFamily: "Manrope",
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  categoryLimitUnderline: {
    width: 28,
    height: 1.5,
    backgroundColor: "rgba(74, 144, 226, 0.3)",
    borderRadius: 1,
  },
  step3Actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  startOverButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  startOverButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: "Manrope",
  },
  createButton: {
    flex: 2,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  createButtonIcon: {
    marginRight: 4,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
});
