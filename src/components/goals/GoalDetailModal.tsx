import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  ScrollView,
  Dimensions,
  TouchableWithoutFeedback,
  Animated,
  Alert,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Goal } from "@/src/types/finny";
import { GoalDetailModalProps } from "@/src/types/goalsTypes";
import logger from "@/src/utils/core/logger";
import {
  getCategoryDisplayName,
  getCategoryOptions,
} from "@/src/utils/categories/goalCategories";
import CategoryPickerModal from "@/src/components/shared/CategoryPickerModal";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import { supabase } from "@/src/lib/supabase/supabase";
import { ActivityIndicator } from "react-native";
import IconButton from "@/src/components/shared/IconButton";
import GoalAnalysisModal from "@/src/components/modals/GoalAnalysisModal";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const GoalDetailModal = ({
  goal,
  visible,
  onClose,
  onDelete,
  onEdit,
  onOptimisticUpdate,
}: GoalDetailModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedGoal, setEditedGoal] = useState<Goal | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [localProgressAmount, setLocalProgressAmount] = useState<number>(0);
  const [showNoteField, setShowNoteField] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isProgressFocused, setIsProgressFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [progressSectionY, setProgressSectionY] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const pollingAttemptsRef = useRef(0);
  const MAX_POLLING_ATTEMPTS = 30; // 30 attempts * 1.5s = 45 seconds max

  // Animation refs
  const noteAnimation = useRef(new Animated.Value(0)).current;
  const noteHeightAnimation = useRef(new Animated.Value(0)).current;
  const goalDetailSlideAnim = useRef(new Animated.Value(0)).current;
  const sheetHeightAnim = useRef(new Animated.Value(0)).current;
  const didInitSheetHeightRef = useRef(false);
  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);

  React.useEffect(() => {
    // Reset analysis state first when goal changes to prevent showing wrong analysis
    setAnalysis(null);
    setIsAnalyzing(false);
    if (showFullAnalysis) {
      setShowFullAnalysis(false); // Reset full analysis view when goal changes
    }
    // Reset animation values
    goalDetailSlideAnim.setValue(0);

    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingAttemptsRef.current = 0;

    if (goal) {
      setEditedGoal(goal);
      // Set the selected date based on goal's target_date
      const date = new Date(goal.target_date);
      setSelectedDate(date);
      // Initialize local progress amount
      setLocalProgressAmount(goal.current_amount || 0);
      // Initialize note field visibility based on whether goal has a note
      setShowNoteField(!!goal.note);
      // Reset animations when goal changes
      noteAnimation.setValue(goal.note ? 1 : 0);
      noteHeightAnimation.setValue(goal.note ? 1 : 0);

      // Handle analysis state - use the goal's analysis directly
      if (goal.analysis) {
        setAnalysis(goal.analysis);
        setIsAnalyzing(false);
      } else {
        // Check if analysis is being generated (newly created goal)
        // Start polling if goal was just created (no analysis and goal is recent)
        const goalCreatedAt = new Date(goal.created_at);
        const now = new Date();
        const minutesSinceCreation =
          (now.getTime() - goalCreatedAt.getTime()) / (1000 * 60);

        // If goal was created in the last 2 minutes, start polling
        if (minutesSinceCreation < 2) {
          setIsAnalyzing(true);
          // Use the current goal ID to start polling
          startPollingForAnalysis(goal.id);
        } else {
          setIsAnalyzing(false);
        }
      }
    }
  }, [goal?.id]); // Only depend on goal.id to properly detect goal changes

  // Dynamically size the sheet based on its content, capped by available viewport.
  // This prevents clipping (especially when the analysis snippet appears, or when the
  // keyboard is up) while still keeping the modal feeling like a premium bottom sheet.
  useEffect(() => {
    if (!visible) {
      sheetHeightAnim.setValue(0);
      didInitSheetHeightRef.current = false;
      return;
    }

    const maxSheetHeight = Math.max(
      320,
      SCREEN_HEIGHT -
        Math.max(insets.top, 12) -
        12 -
        Math.max(0, keyboardHeight)
    );
    const minSheetHeight = Math.min(
      maxSheetHeight,
      Math.max(380, SCREEN_HEIGHT * 0.55)
    );

    const measuredTotal =
      (headerHeight || 0) + (footerHeight || 0) + (scrollContentHeight || 0);

    const target = Math.max(
      minSheetHeight,
      Math.min(
        maxSheetHeight,
        measuredTotal > 0 ? measuredTotal : minSheetHeight
      )
    );

    // Prevent a blank/zero-height first paint (common on slower devices
    // where the effect runs a frame later).
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
  }, [
    visible,
    headerHeight,
    footerHeight,
    scrollContentHeight,
    keyboardHeight,
    insets.top,
    sheetHeightAnim,
  ]);

  // Polling function to check for analysis - takes goalId parameter to ensure correct goal
  const startPollingForAnalysis = (goalId: string) => {
    if (!goalId || !goal) return;

    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingAttemptsRef.current = 0;

    const pollForAnalysis = async () => {
      // Check if goal has changed - if so, stop polling
      if (goal?.id !== goalId) {
        setIsAnalyzing(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      if (pollingAttemptsRef.current >= MAX_POLLING_ATTEMPTS) {
        // Max attempts reached - stop polling and hide spinner
        setIsAnalyzing(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      pollingAttemptsRef.current++;

      try {
        const authResult = await getAuthenticatedUser();
        if (!authResult?.user?.id || goal?.id !== goalId) {
          setIsAnalyzing(false);
          return;
        }

        // Fetch goal directly from Supabase to check if analysis exists
        // Use goalId parameter to ensure we're checking the correct goal
        const { data: goalData, error } = await supabase
          .from("goals")
          .select("analysis")
          .eq("id", goalId)
          .eq("user_id", authResult.user.id)
          .single();

        // Double-check goal hasn't changed before updating state
        if (goal?.id === goalId && !error && goalData?.analysis) {
          // Analysis found - stop polling and update state
          setAnalysis(goalData.analysis);
          setIsAnalyzing(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          // Update goal in parent if onOptimisticUpdate is available
          if (onOptimisticUpdate && goal) {
            onOptimisticUpdate({
              ...goal,
              analysis: goalData.analysis,
            });
          }
        }
      } catch (error) {
        logger.error("❌ [GOAL ANALYSIS] Polling error:", error);
        // Continue polling on error (might be transient)
      }
    };

    // Start polling immediately, then every 1.5 seconds
    pollForAnalysis();
    pollingIntervalRef.current = setInterval(pollForAnalysis, 1500);
  };

  // Animate note field when showNoteField changes
  useEffect(() => {
    if (showNoteField) {
      // Animate in
      Animated.parallel([
        Animated.timing(noteHeightAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false, // Height animation can't use native driver
        }),
        Animated.timing(noteAnimation, {
          toValue: 1,
          duration: 300,
          delay: 100, // Slight delay for smoother effect
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(noteAnimation, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(noteHeightAnimation, {
          toValue: 0,
          duration: 300,
          delay: 50, // Slight delay for smoother collapse
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [showNoteField]);

  // Animate goal detail view slide when analysis modal opens/closes
  useEffect(() => {
    if (showFullAnalysis) {
      // Slide main view to the left when analysis modal opens
      Animated.timing(goalDetailSlideAnim, {
        toValue: -SCREEN_WIDTH,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Slide main view back to center when analysis modal closes
      Animated.timing(goalDetailSlideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [showFullAnalysis, goalDetailSlideAnim]);

  // Keyboard listeners to smoothly adjust padding and scroll target into view
  useEffect(() => {
    const onShow = (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);

      if (isProgressFocused && scrollViewRef.current) {
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, progressSectionY - 60),
            animated: true,
          });
        });
      }
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillShow", onShow)
        : Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillHide", onHide)
        : Keyboard.addListener("keyboardDidHide", onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [isProgressFocused, progressSectionY]);

  // Check if progress has been changed
  const hasProgressChanged =
    goal && localProgressAmount !== (goal.current_amount || 0);

  const handleClose = () => {
    // Stop polling when modal closes
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingAttemptsRef.current = 0;

    // Reset full analysis view
    setShowFullAnalysis(false);

    // If in editing mode, first exit editing mode
    if (isEditing) {
      setIsEditing(false);
      setEditedGoal(goal);
      // Reset note field state
      setShowNoteField(!!goal?.note);
      noteAnimation.setValue(goal?.note ? 1 : 0);
      noteHeightAnimation.setValue(goal?.note ? 1 : 0);
      onClose();
      return;
    }

    // Save progress changes before closing
    if (onEdit && goal && localProgressAmount !== (goal.current_amount || 0)) {
      onEdit(goal.id, { current_amount: localProgressAmount });
    }
    onClose();
  };

  if (!goal || !editedGoal) return null;

  const maxSheetHeight = Math.max(
    320,
    SCREEN_HEIGHT - Math.max(insets.top, 12) - 12 - Math.max(0, keyboardHeight)
  );
  const minSheetHeight = Math.min(
    maxSheetHeight,
    Math.max(380, SCREEN_HEIGHT * 0.55)
  );

  const handleSave = async () => {
    if (onEdit && editedGoal && goal) {
      const updates: Partial<Goal> = {
        label: editedGoal.label.trim(),
        note: editedGoal.note?.trim() || undefined,
        target_amount: editedGoal.target_amount,
        current_amount: editedGoal.current_amount,
        target_date: selectedDate.toISOString().split("T")[0],
        category: editedGoal.category,
        status: editedGoal.status,
      };

      // Only save if there are actual changes
      const hasChanges = Object.keys(updates).some((key) => {
        const updateKey = key as keyof Goal;
        return updates[updateKey] !== goal[updateKey];
      });

      if (hasChanges) {
        // Create optimistically updated goal
        const optimisticGoal: Goal = {
          ...goal,
          ...updates,
          updated_at: new Date().toISOString(),
        };

        // Optimistic update: Update UI immediately
        if (onOptimisticUpdate) {
          onOptimisticUpdate(optimisticGoal);
        }

        // Exit editing mode immediately for better UX
        setIsEditing(false);

        try {
          // Update database in background
          await onEdit(goal.id, updates);
        } catch (error) {
          // If database update fails, we could revert or show error
          // For now, the parent component handles error states
          logger.error("Failed to update goal:", error);

          // Could implement revert logic here if needed
          // if (onOptimisticUpdate) {
          //   onOptimisticUpdate(goal); // Revert to original
          // }
        }
      } else {
        // No changes, just exit editing mode
        setIsEditing(false);
      }
    }
  };

  // Get snippet of analysis (text until first blank line)
  const getAnalysisSnippet = (text: string): string => {
    if (!text) return "";
    const firstBlankLineIndex = text.indexOf("\n\n");
    if (firstBlankLineIndex === -1) {
      // If no blank line, return first paragraph or first 200 chars
      const firstNewline = text.indexOf("\n");
      if (firstNewline === -1) {
        return text.length > 200 ? text.substring(0, 200) + "..." : text;
      }
      return text.substring(0, firstNewline);
    }
    return text.substring(0, firstBlankLineIndex).trim();
  };

  // Check if analysis has more content beyond snippet
  const hasMoreAnalysis = (text: string): boolean => {
    if (!text) return false;
    const snippet = getAnalysisSnippet(text);
    return text.length > snippet.length;
  };

  // Parse markdown-style bold text (**text**) and render with bold formatting (for snippet only)
  const renderAnalysisText = (text: string) => {
    if (!text) return null;

    const displayText = getAnalysisSnippet(text);

    // Split by **text** pattern while keeping the delimiters
    const parts: (string | { bold: string })[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(displayText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(displayText.substring(lastIndex, match.index));
      }
      // Add the bold text
      parts.push({ bold: match[1] });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text after last match
    if (lastIndex < displayText.length) {
      parts.push(displayText.substring(lastIndex));
    }

    // If no matches, return original text
    if (parts.length === 0) {
      parts.push(displayText);
    }

    return (
      <Text style={styles.analysisText}>
        {parts.map((part, index) => {
          if (typeof part === "object" && "bold" in part) {
            return (
              <Text key={index} style={styles.analysisBoldText}>
                {part.bold}
              </Text>
            );
          }
          return <Text key={index}>{part as string}</Text>;
        })}
      </Text>
    );
  };

  const renderProgressSection = () => {
    const targetAmount = goal.target_amount || 0;

    return (
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Current Progress</Text>
          <Text style={styles.progressAmount}>
            of ${targetAmount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.progressInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.progressInput}
            value={String(localProgressAmount)}
            onChangeText={(text) => {
              const newAmount = Math.max(0, parseFloat(text) || 0);
              setLocalProgressAmount(newAmount);
            }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#666"
          />
        </View>
      </View>
    );
  };

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
                  marginBottom: Math.max(
                    0,
                    keyboardHeight - (insets.bottom || 0)
                  ),
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

                <View
                  style={styles.header}
                  onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
                >
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitle}>
                      {isEditing ? `Edit Goal` : goal.label}
                    </Text>
                  </View>
                </View>

                {/* Normal Goal Detail View */}
                <Animated.View
                  style={{
                    flex: 1,
                    transform: [{ translateX: goalDetailSlideAnim }],
                    minHeight: 200,
                  }}
                >
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    ref={scrollViewRef}
                    style={{ flex: 1 }}
                    contentContainerStyle={[
                      styles.scrollContent,
                      {
                        paddingBottom: Math.max(
                          20,
                          (insets.bottom || 0) + SCREEN_HEIGHT * 0.02
                        ),
                      },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    nestedScrollEnabled={true}
                    scrollEventThrottle={16}
                    onContentSizeChange={(_, h) => setScrollContentHeight(h)}
                  >
                    {!isEditing && (
                      <>
                        <View style={styles.infoSection}>
                          <View style={styles.topInfoRow}>
                            <View style={styles.targetSection}>
                              <Text style={styles.targetLabel}>TARGET</Text>
                              <Text style={styles.targetAmountMain}>
                                ${(goal.target_amount || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.statusBadge,
                                {
                                  backgroundColor:
                                    goal.status === "completed"
                                      ? "#32D74B"
                                      : goal.status === "paused"
                                      ? "#FF9500"
                                      : "#4A90E2",
                                },
                              ]}
                            >
                              <Text style={styles.statusText}>
                                {goal.status.charAt(0).toUpperCase() +
                                  goal.status.slice(1)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.categoryDateRow}>
                            <View
                              style={[
                                styles.categoryDisplay,
                                {
                                  backgroundColor:
                                    getCategoryOptions().find(
                                      (c) => c.value === goal.category
                                    )?.backgroundColor ||
                                    "rgba(255,255,255,0.08)",
                                },
                              ]}
                            >
                              <Text style={styles.categoryEmoji}>
                                {getCategoryOptions().find(
                                  (c) => c.value === goal.category
                                )?.emoji || "🎯"}
                              </Text>
                              <Text
                                style={[
                                  styles.categoryName,
                                  {
                                    color:
                                      getCategoryOptions().find(
                                        (c) => c.value === goal.category
                                      )?.color || "#fff",
                                  },
                                ]}
                              >
                                {getCategoryDisplayName(goal.category)}
                              </Text>
                            </View>

                            <View style={styles.dateDisplay}>
                              <Text style={styles.detailLabel}>
                                Target Date
                              </Text>
                              <Text style={styles.detailValue}>
                                {new Date(goal.target_date).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  }
                                )}
                              </Text>
                            </View>
                          </View>

                          {/* Loading chip for analysis */}
                          {isAnalyzing && (
                            <View style={styles.analysisLoadingChip}>
                              <ActivityIndicator
                                size="small"
                                color="#4A90E2"
                                style={styles.analysisLoadingSpinner}
                              />
                              <Text style={styles.analysisLoadingText}>
                                Finny is thinking about your goal...
                              </Text>
                            </View>
                          )}

                          {/* Analysis snippet with Read More */}
                          {analysis &&
                            !isAnalyzing &&
                            (Platform.OS === "ios" ? (
                              <BlurView
                                intensity={80}
                                tint="dark"
                                style={styles.analysisSnippetSection}
                              >
                                <View style={styles.analysisSnippetContent}>
                                  {renderAnalysisText(analysis)}
                                  {hasMoreAnalysis(analysis) && (
                                    <TouchableOpacity
                                      onPress={() => setShowFullAnalysis(true)}
                                      style={styles.readMoreButton}
                                      activeOpacity={0.8}
                                    >
                                      <Text style={styles.readMoreText}>
                                        Read More from Finny
                                      </Text>
                                      <Ionicons
                                        name="chevron-forward"
                                        size={14}
                                        color="#4A90E2"
                                        style={styles.readMoreIcon}
                                      />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </BlurView>
                            ) : (
                              <View style={styles.analysisSnippetSection}>
                                <View style={styles.analysisSnippetContent}>
                                  {renderAnalysisText(analysis)}
                                  {hasMoreAnalysis(analysis) && (
                                    <TouchableOpacity
                                      onPress={() => setShowFullAnalysis(true)}
                                      style={styles.readMoreButton}
                                      activeOpacity={0.8}
                                    >
                                      <Text style={styles.readMoreText}>
                                        Read More from Finny
                                      </Text>
                                      <Ionicons
                                        name="chevron-forward"
                                        size={14}
                                        color="#4A90E2"
                                        style={styles.readMoreIcon}
                                      />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            ))}

                          {goal.note && (
                            <View style={styles.noteSection}>
                              <Text style={styles.noteText}>{goal.note}</Text>
                            </View>
                          )}
                        </View>

                        <View
                          onLayout={(e) =>
                            setProgressSectionY(e.nativeEvent.layout.y)
                          }
                        >
                          <View style={styles.progressSection}>
                            <View style={styles.progressHeader}>
                              <Text style={styles.progressTitle}>
                                Current Progress
                              </Text>
                              <Text style={styles.progressAmount}>
                                of ${(goal.target_amount || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View style={styles.progressInputContainer}>
                              <Text style={styles.currencySymbol}>$</Text>
                              <TextInput
                                style={styles.progressInput}
                                value={String(localProgressAmount)}
                                onChangeText={(text) => {
                                  const newAmount = Math.max(
                                    0,
                                    parseFloat(text) || 0
                                  );
                                  setLocalProgressAmount(newAmount);
                                }}
                                onFocus={() => {
                                  setIsInputFocused(true);
                                  setIsProgressFocused(true);
                                }}
                                onBlur={() => {
                                  setIsInputFocused(false);
                                  setIsProgressFocused(false);
                                }}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#666"
                              />
                              {hasProgressChanged && (
                                <TouchableOpacity
                                  onPress={handleClose}
                                  style={styles.progressSaveButton}
                                  activeOpacity={0.7}
                                >
                                  <LinearGradient
                                    colors={[
                                      "rgba(50, 215, 75, 0.15)",
                                      "rgba(50, 215, 75, 0.05)",
                                    ]}
                                    style={styles.progressSaveIcon}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                  >
                                    <Ionicons
                                      name="checkmark-outline"
                                      size={16}
                                      color="#32D74B"
                                    />
                                  </LinearGradient>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                      </>
                    )}

                    {isEditing && (
                      <View style={styles.editSection}>
                        <View style={styles.editNameRow}>
                          <Text style={styles.editLabel}>Goal Name</Text>
                          <TextInput
                            style={styles.editNameInput}
                            value={editedGoal.label}
                            onChangeText={(text) =>
                              setEditedGoal({
                                ...editedGoal,
                                label: text,
                              })
                            }
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => setIsInputFocused(false)}
                            placeholder="Goal name"
                            placeholderTextColor="#666"
                          />
                        </View>

                        <View style={styles.editRow}>
                          <View style={styles.editField}>
                            <Text style={styles.editLabel}>Target Amount</Text>
                            <View style={styles.editAmountContainer}>
                              <Text style={styles.currencySymbol}>$</Text>
                              <TextInput
                                style={styles.amountInput}
                                value={String(editedGoal.target_amount || 0)}
                                onChangeText={(text) =>
                                  setEditedGoal({
                                    ...editedGoal,
                                    target_amount: parseFloat(text) || 0,
                                  })
                                }
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#666"
                              />
                            </View>
                          </View>

                          <View style={styles.editField}>
                            <Text style={styles.editLabel}>Category</Text>
                            <TouchableOpacity
                              style={styles.editCategoryButton}
                              onPress={() => setShowCategoryPicker(true)}
                            >
                              <View style={styles.editCategoryContent}>
                                <Text style={styles.editCategoryEmoji}>
                                  {getCategoryOptions().find(
                                    (c) => c.value === editedGoal.category
                                  )?.emoji || "🎯"}
                                </Text>
                                <Text style={styles.editCategoryText}>
                                  {getCategoryDisplayName(editedGoal.category)}
                                </Text>
                              </View>
                              <Ionicons
                                name="chevron-down"
                                size={16}
                                color="#888"
                              />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={styles.editDateRow}>
                          <Text style={styles.editLabel}>Target Date</Text>
                          <TouchableOpacity
                            style={styles.editDateButton}
                            onPress={() => setShowDatePicker(true)}
                          >
                            <Text style={styles.editDateText}>
                              {selectedDate.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                            <Ionicons
                              name="calendar"
                              size={16}
                              color="#4A90E2"
                            />
                          </TouchableOpacity>
                        </View>

                        {/* Note editing section */}
                        {!showNoteField ? (
                          <TouchableOpacity
                            style={styles.addNoteButtonContainer}
                            onPress={() => setShowNoteField(true)}
                            activeOpacity={0.7}
                          >
                            <LinearGradient
                              colors={[
                                "rgba(74, 144, 226, 0.15)",
                                "rgba(74, 144, 226, 0.05)",
                              ]}
                              style={styles.addNoteButton}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                            >
                              <Ionicons
                                name="add-circle-outline"
                                size={18}
                                color="#4A90E2"
                              />
                              <Text style={styles.addNoteText}>Add note</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        ) : (
                          <Animated.View
                            style={[
                              styles.editNoteSection,
                              {
                                maxHeight: noteHeightAnimation.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, 200], // Adjust based on content height
                                }),
                                overflow: "hidden", // Ensure content clips during animation
                              },
                            ]}
                          >
                            <Animated.View
                              style={{
                                opacity: noteAnimation,
                                transform: [
                                  {
                                    translateY: noteAnimation.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [-10, 0],
                                    }),
                                  },
                                ],
                              }}
                            >
                              <View style={styles.noteHeader}>
                                <Text style={styles.editLabel}>
                                  Note (Optional)
                                </Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    setShowNoteField(false);
                                    setEditedGoal((prev) =>
                                      prev ? { ...prev, note: undefined } : null
                                    );
                                  }}
                                  style={styles.removeNoteButton}
                                >
                                  <Ionicons
                                    name="close-circle"
                                    size={16}
                                    color="#888"
                                  />
                                </TouchableOpacity>
                              </View>
                              <Animated.View
                                style={{
                                  transform: [
                                    {
                                      scale: noteAnimation.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.95, 1],
                                      }),
                                    },
                                  ],
                                }}
                              >
                                <TextInput
                                  style={styles.editNoteInput}
                                  value={editedGoal?.note || ""}
                                  onChangeText={(text) =>
                                    setEditedGoal((prev) =>
                                      prev ? { ...prev, note: text } : null
                                    )
                                  }
                                  onFocus={() => setIsInputFocused(true)}
                                  onBlur={() => setIsInputFocused(false)}
                                  placeholder="Add a note about this goal..."
                                  placeholderTextColor="#666"
                                  multiline
                                  textAlignVertical="top"
                                  maxLength={200}
                                />
                              </Animated.View>
                            </Animated.View>
                          </Animated.View>
                        )}
                      </View>
                    )}
                  </ScrollView>
                </Animated.View>

                {/* Bottom action buttons */}
                <View
                  onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
                  style={{ paddingBottom: Math.max(0, insets.bottom) }}
                >
                  {!isEditing ? (
                    <View style={styles.bottomButtonRow}>
                      <TouchableOpacity
                        style={[
                          styles.bottomButtonContainer,
                          styles.bottomEditButtonContainer,
                        ]}
                        onPress={() => setIsEditing(true)}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[
                            "rgba(74, 144, 226, 0.15)",
                            "rgba(74, 144, 226, 0.05)",
                          ]}
                          style={styles.bottomEditButton}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Ionicons name="pencil" size={19} color="#4A90E2" />
                          <Text
                            style={[
                              styles.bottomButtonText,
                              { color: "#4A90E2" },
                            ]}
                          >
                            Edit Goal
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.bottomButtonContainer,
                          styles.bottomDeleteButtonContainer,
                        ]}
                        onPress={() => {
                          Alert.alert(
                            "Delete Goal",
                            `Are you sure you want to delete "${goal.label}"? This action cannot be undone.`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => {
                                  onDelete(goal);
                                  handleClose();
                                },
                              },
                            ]
                          );
                        }}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[
                            "rgba(255, 59, 48, 0.15)",
                            "rgba(255, 59, 48, 0.05)",
                          ]}
                          style={styles.bottomDeleteButton}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Ionicons
                            name="trash-sharp"
                            size={19}
                            color="#FF3B30"
                          />
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.bottomButtonRow}>
                      <TouchableOpacity
                        style={[
                          styles.bottomButtonContainer,
                          styles.bottomCancelButtonContainer,
                        ]}
                        onPress={() => {
                          setIsEditing(false);
                          setEditedGoal(goal);
                          setShowNoteField(!!goal?.note);
                          noteAnimation.setValue(goal?.note ? 1 : 0);
                          noteHeightAnimation.setValue(goal?.note ? 1 : 0);
                        }}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[
                            "rgba(142, 142, 147, 0.15)",
                            "rgba(142, 142, 147, 0.05)",
                          ]}
                          style={styles.bottomCancelButton}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Ionicons
                            name="close-circle"
                            size={16}
                            color="#fff"
                          />
                          <Text
                            style={[styles.bottomButtonText, { color: "#fff" }]}
                          >
                            Cancel
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.bottomButtonContainer,
                          styles.bottomSaveButtonContainer,
                        ]}
                        onPress={handleSave}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[
                            "rgba(50, 215, 75, 0.15)",
                            "rgba(50, 215, 75, 0.05)",
                          ]}
                          style={styles.bottomSaveButton}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#fff"
                          />
                          <Text
                            style={[styles.bottomButtonText, { color: "#fff" }]}
                          >
                            Save Changes
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {showDatePicker && (
                  <Modal
                    visible={showDatePicker}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowDatePicker(false)}
                  >
                    <TouchableWithoutFeedback
                      onPress={() => setShowDatePicker(false)}
                    >
                      <View style={styles.datePickerOverlay}>
                        <TouchableWithoutFeedback
                          onPress={(e) => e.stopPropagation()}
                        >
                          <View style={styles.datePickerModal}>
                            <View style={styles.datePickerHeader}>
                              <TouchableOpacity
                                onPress={() => setShowDatePicker(false)}
                              >
                                <LinearGradient
                                  colors={[
                                    "rgba(255, 255, 255, 0.12)",
                                    "rgba(255, 255, 255, 0.03)",
                                  ]}
                                  style={styles.datePickerButton}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                >
                                  <Text style={styles.datePickerCancel}>
                                    Cancel
                                  </Text>
                                </LinearGradient>
                              </TouchableOpacity>
                              <Text style={styles.datePickerTitle}>
                                Select Date
                              </Text>
                              <TouchableOpacity
                                onPress={() => setShowDatePicker(false)}
                              >
                                <LinearGradient
                                  colors={[
                                    "rgba(74, 144, 226, 0.8)",
                                    "rgba(74, 144, 226, 0.6)",
                                  ]}
                                  style={styles.datePickerButton}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                >
                                  <Text style={styles.datePickerDone}>
                                    Done
                                  </Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            </View>
                            <View style={styles.datePickerContent}>
                              <DateTimePicker
                                value={selectedDate}
                                mode="date"
                                display="spinner"
                                onChange={(event, date) => {
                                  if (date) {
                                    setSelectedDate(date);
                                  }
                                }}
                                minimumDate={new Date()}
                                textColor="#fff"
                                style={styles.datePickerSpinner}
                              />
                            </View>
                          </View>
                        </TouchableWithoutFeedback>
                      </View>
                    </TouchableWithoutFeedback>
                  </Modal>
                )}
              </LinearGradient>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {showCategoryPicker && editedGoal && (
        <CategoryPickerModal
          visible={showCategoryPicker}
          selectedCategory={editedGoal.category}
          onSelect={(cat) => setEditedGoal({ ...editedGoal, category: cat })}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}

      {/* Goal Analysis Modal */}
      <GoalAnalysisModal
        visible={showFullAnalysis}
        analysis={analysis}
        isAnalyzing={isAnalyzing}
        onClose={() => setShowFullAnalysis(false)}
      />
    </Modal>
  );
};

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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: Math.max(18, SCREEN_WIDTH * 0.05),
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomButtonRow: {
    flexDirection: "row",
    marginHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    marginBottom: Math.max(20, SCREEN_HEIGHT * 0.025),
    marginTop: 5,
    gap: 12,
  },
  bottomButtonContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  bottomEditButtonContainer: {
    flex: 0.83,
  },
  bottomDeleteButtonContainer: {
    flex: 0.14,
  },
  bottomCancelButtonContainer: {
    flex: 0.4,
  },
  bottomSaveButtonContainer: {
    flex: 0.6,
  },
  bottomEditButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    gap: 8,
  },
  bottomDeleteButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.3)",
  },
  bottomCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(142, 142, 147, 0.3)",
    gap: 8,
  },
  bottomSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(50, 215, 75, 0.3)",
    gap: 8,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  scrollContent: {
    padding: Math.max(20, SCREEN_WIDTH * 0.05),
    flexGrow: 1,
  },
  goalTitleSection: {
    marginBottom: 24,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#4A90E2",
    paddingBottom: 8,
  },
  infoSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  editAmountContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    height: 40,
  },
  currencySymbol: {
    fontSize: 18,
    color: "#888",
    paddingLeft: 12,
    paddingRight: 5,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    color: "#fff",
    paddingHorizontal: 8,
  },
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 10,
    borderRadius: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  datePickerIOS: {
    backgroundColor: "#2a2a2a",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  progressSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 5,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 14,
    color: "#888",
  },
  progressAmount: {
    fontSize: 14,
    color: "#fff",
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 14,
    color: "#fff",
    minWidth: 45,
    textAlign: "right",
  },
  editProgressSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  editProgressLabel: {
    fontSize: 14,
    color: "#888",
    marginBottom: 12,
  },
  progressInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  progressInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  progressSaveButton: {
    padding: 4,
  },
  progressSaveIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(50, 215, 75, 0.3)",
  },
  progressSymbol: {
    fontSize: 16,
    color: "#888",
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editButton: {
    backgroundColor: "#4A90E2",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  saveButton: {
    backgroundColor: "#32D74B",
  },
  cancelButton: {
    backgroundColor: "#8E8E93",
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
  },
  categoryDisplay: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    alignSelf: "flex-start",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // New redesigned styles
  topInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  targetSection: {
    alignItems: "flex-start",
  },
  targetLabel: {
    fontSize: 10,
    color: "#888",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  targetAmountMain: {
    fontSize: Math.max(20, SCREEN_WIDTH * 0.06),
    color: "#fff",
    fontWeight: "700",
  },
  detailsRow: {
    marginBottom: 16,
  },
  detailItem: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  categoryDateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  dateDisplay: {
    alignItems: "flex-end",
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "500",
  },
  // Edit section styles
  editSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: Math.max(20, SCREEN_WIDTH * 0.05),
    marginBottom: 0,
  },
  editNameRow: {
    marginBottom: 20,
  },
  editNameInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editRow: {
    flexDirection: SCREEN_WIDTH < 400 ? "column" : "row",
    gap: 16,
    marginBottom: 20,
  },
  editField: {
    flex: 1,
  },
  editLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editCategoryButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editCategoryContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editCategoryEmoji: {
    fontSize: 16,
  },
  editCategoryText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  editDateRow: {
    marginBottom: 0,
  },
  editDateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editDateText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  // Note editing styles
  addNoteButtonContainer: {
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 40,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  addNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    gap: 8,
  },
  addNoteText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "500",
  },
  editNoteSection: {
    marginTop: 12,
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  removeNoteButton: {
    padding: 4,
  },
  editNoteInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    minHeight: 80,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    textAlignVertical: "top",
  },
  // Category modal styles
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  categoryModalContent: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingVertical: 20,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: Math.max(8, SCREEN_WIDTH * 0.02),
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
  },
  categoryGridItem: {
    borderRadius: 14,
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: Math.max(80, SCREEN_WIDTH * 0.2),
    maxWidth: Math.max(200, SCREEN_WIDTH * 0.45),
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 2,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  categoryGridEmoji: {
    fontSize: 16,
    marginRight: 6,
    textAlign: "center",
    minWidth: 16,
  },
  categoryGridText: {
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
    flexShrink: 1,
    flexGrow: 0,
  },
  categoryGridCheckmark: {
    marginLeft: 6,
    opacity: 0.9,
  },
  // Date picker modal styles
  datePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  datePickerModal: {
    backgroundColor: "#2a2a2a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    minHeight: 280,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#2a2a2a",
  },
  datePickerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  datePickerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  datePickerCancel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  datePickerDone: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
  datePickerSpinner: {
    width: "100%",
    height: 180,
    backgroundColor: "transparent",
  },
  descriptionSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  descriptionText: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 20,
    marginTop: 4,
  },
  noteSection: {
    marginTop: 1,
    marginLeft: 8,
  },
  noteText: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 20,
    marginTop: 4,
  },
  // Analysis loading chip styles
  analysisLoadingChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  analysisLoadingSpinner: {
    marginRight: 8,
  },
  analysisLoadingText: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "500",
  },
  // Analysis display styles with glass effect
  analysisSection: {
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
    overflow: "hidden",
    height: 300, // Fixed height for the container
  },
  analysisScrollView: {
    flex: 1,
    height: 300,
  },
  analysisScrollContent: {
    padding: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },
  analysisText: {
    fontSize: 14,
    color: "#fff",
    lineHeight: 22,
  },
  analysisBoldText: {
    fontSize: 14,
    color: "#fff",
    lineHeight: 22,
    fontWeight: "700",
  },
  // Analysis snippet styles
  analysisSnippetSection: {
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 12,
    overflow: "hidden" as const,
  },
  analysisSnippetContent: {
    padding: 12,
  },
  readMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    alignSelf: "flex-start",
  },
  readMoreText: {
    color: "#4A90E2",
    fontSize: 13,
    fontWeight: "600",
    marginRight: 4,
  },
  readMoreIcon: {
    marginLeft: 2,
  },
});

export default GoalDetailModal;
