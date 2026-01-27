import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Animated,
  Easing,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Keyboard,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { CURATED_ICONS } from "@/src/components/shared/modal-constants";

interface CategoryLike {
  category: string;
  categoryId?: string | null;
  color: string;
  budget: number;
  entryId?: string | null;
  parentCategoryId?: string | null;
  icon?: string | null;
}

interface GroupOption extends CategoryLike {
  category: string;
  icon?: string | null;
  color: string;
}

interface Props {
  visible: boolean;
  category: CategoryLike | null;
  parentLabel?: string | null;
  onClose: () => void;
  onSave: (amount: number) => Promise<boolean>;
  onGroupPress?: () => void;
  onDeletePress?: () => void;
  // New props for inline grouping
  groupOptions?: GroupOption[];
  onGroupCategory?: (
    childCategoryId: string,
    parentCategoryId: string
  ) => Promise<boolean>;
  onRemoveGrouping?: (childCategoryId: string) => Promise<boolean>;
  // Callbacks for name/icon updates
  onNameUpdate?: (categoryId: string, newName: string) => Promise<boolean>;
  onIconUpdate?: (categoryId: string, newIcon: string) => Promise<boolean>;
  refreshBudget?: () => Promise<void>;
}

const CategoryEditModal: React.FC<Props> = ({
  visible,
  category,
  parentLabel,
  onClose,
  onSave,
  onGroupPress,
  onDeletePress,
  groupOptions = [],
  onGroupCategory,
  onRemoveGrouping,
  onNameUpdate,
  onIconUpdate,
  refreshBudget,
}) => {
  const [amount, setAmount] = useState<string>(
    category ? Math.round(category.budget).toString() : ""
  );
  const [originalAmount, setOriginalAmount] = useState<number>(
    category ? Math.round(category.budget) : 0
  );
  const [mode, setMode] = useState<"edit" | "group">("edit");
  const screenHeight = Dimensions.get("window").height;
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);
  const [currentCategory, setCurrentCategory] = useState(category);
  const amountInputRef = useRef<TextInput>(null);
  
  // Inline editing states
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(category?.category || "");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [currentIcon, setCurrentIcon] = useState<string | null>(
    category?.icon || null
  );
  const iconPickerAnim = useRef(new Animated.Value(0)).current;
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && category) {
      setCurrentCategory(category);
      const budgetAmount = category ? Math.round(category.budget) : 0;
      setAmount(budgetAmount.toString());
      setOriginalAmount(budgetAmount);
      setMode("edit"); // Reset to edit mode when modal opens
      setRendered(true);
      slideAnim.setValue(screenHeight);
      setIsEditingName(false);
      setEditingName(category.category || "");
      setCurrentIcon(category.icon || null);
      setShowIconPicker(false);
      iconPickerAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => setRendered(false));
    }
  }, [visible, category, rendered, screenHeight, slideAnim]);
  
  // Wrapper for onClose that saves any pending name changes
  const handleClose = async () => {
    // Save any pending name changes before closing
    if (isEditingName && category?.categoryId && editingName.trim() && editingName.trim() !== category.category) {
      await handleNameUpdate(editingName);
    }
    onClose();
  };
  
  // Animate icon picker
  useEffect(() => {
    if (showIconPicker) {
      Animated.timing(iconPickerAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(iconPickerAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [showIconPicker, iconPickerAnim]);
  
  // Focus name input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isEditingName]);

  // Handle keyboard events manually for smooth bottom sheet behavior
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === "ios" ? e.duration || 250 : 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === "ios" ? e.duration || 250 : 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  // Use category prop directly instead of currentCategory to avoid timing issues
  if (!visible || !category) return null;

  const handleSave = async () => {
    const parsed = parseAmount();
    if (parsed === null) return;

    // Save budget (amount will animate smoothly via optimistic update)
    const success = await onSave(parsed).catch(() => {
      // parent handles rollback
      return false;
    });

    if (success) {
      // Close modal after successful save
      handleClose();
    }
  };

  const handleGroup = async (parentCategoryId: string) => {
    if (!category.categoryId || !onGroupCategory) return;
    await onGroupCategory(category.categoryId, parentCategoryId);
    handleClose();
  };

  const handleRemoveGroup = async () => {
    if (!category.categoryId || !onRemoveGrouping) return;
    await onRemoveGrouping(category.categoryId);
    handleClose();
  };

  const handleDelete = () => {
    if (!onDeletePress) return;

    const categoryName = category?.category || "this category";

    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${categoryName}"? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            onDeletePress();
          },
        },
      ]
    );
  };
  
  // Handle category name update
  const handleNameUpdate = async (newName: string) => {
    if (!category?.categoryId || !newName.trim() || newName.trim() === category.category) {
      setIsEditingName(false);
      setEditingName(category?.category || "");
      return;
    }
    
    try {
      // Use callback if provided (it handles DB update, refresh, and logging)
      if (onNameUpdate) {
        const success = await onNameUpdate(category.categoryId, newName.trim());
        if (!success) {
          setEditingName(category?.category || "");
        } else {
          setCurrentCategory({ ...category, category: newName.trim() });
        }
      } else {
        // Fallback: Update directly if callback not provided
        const oldName = category.category;
        const baseSlug = newName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .trim();
        
        const { error } = await supabase
          .from("categories")
          .update({ 
            name: newName.trim(),
            slug: baseSlug,
          })
          .eq("id", category.categoryId);
          
        if (error) throw error;
        
        setCurrentCategory({ ...category, category: newName.trim() });
        logger.info(`[CATEGORY] Updated name: "${oldName}" → "${newName.trim()}" (${category.categoryId})`);
        
        if (refreshBudget) {
          await refreshBudget();
        }
      }
      
      setIsEditingName(false);
    } catch (error) {
      logger.error("[BUDGET] Error updating category name:", error);
      setEditingName(category?.category || "");
      setIsEditingName(false);
    }
  };
  
  // Handle icon update - optimistic update (instant UI, background DB)
  const handleIconUpdate = async (newIcon: string) => {
    if (!category?.categoryId || newIcon === currentIcon) {
      setShowIconPicker(false);
      return;
    }
    
    // OPTIMISTIC UPDATE: Update UI instantly
    const previousIcon = currentIcon || null;
    setCurrentIcon(newIcon);
    setCurrentCategory({ ...category, icon: newIcon });
    setShowIconPicker(false);
    
    // Update database in background
    (async () => {
      try {
        // Use callback if provided (it handles DB update, refresh, and logging)
        if (onIconUpdate && category.categoryId) {
          const success = await onIconUpdate(category.categoryId, newIcon);
          if (!success) {
            setCurrentIcon(previousIcon);
            setCurrentCategory({ ...category, icon: previousIcon });
            logger.error("[BUDGET] Failed to update category icon, rolling back");
          }
        } else {
          // Fallback: Update directly if callback not provided
          const categoryName = category.category || "Unknown";
          const { error } = await supabase
            .from("categories")
            .update({ icon: newIcon })
            .eq("id", category.categoryId);
            
          if (error) throw error;
          
          logger.info(`[CATEGORY] Updated icon: "${categoryName}" → ${newIcon} (${category.categoryId})`);
          
          if (refreshBudget) {
            await refreshBudget();
          }
        }
      } catch (error) {
        // Rollback on error
        setCurrentIcon(previousIcon);
        setCurrentCategory({ ...category, icon: previousIcon });
        logger.error("[BUDGET] Error updating category icon, rolling back:", error);
      }
    })();
  };
  
  // Get icon display helper
  const getCategoryIconDisplay = (iconValue?: string | null) => {
    if (iconValue) {
      const emojiRegex =
        /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
      if (emojiRegex.test(iconValue)) {
        return { type: "emoji" as const, value: iconValue };
      }
      return {
        type: "ionicon" as const,
        value: iconValue as keyof typeof Ionicons.glyphMap,
      };
    }
    return { type: "emoji" as const, value: "💰" };
  };
  
  const iconDisplay = getCategoryIconDisplay(currentIcon);
  
  // Check if budget has changed
  const parseAmount = () => {
    const next = parseFloat(amount);
    return isNaN(next) || next < 0 ? null : next;
  };
  
  const currentBudgetAmount = parseAmount();
  const hasBudgetChanged = currentBudgetAmount !== null && currentBudgetAmount !== originalAmount;

  const filteredGroupOptions = groupOptions.filter((c) => {
    if (!c.categoryId) return false;
    if (c.categoryId === category.categoryId) return false;
    if (c.parentCategoryId === category.categoryId) return false;
    if (c.parentCategoryId) return false; // don't allow using an existing child as a parent
    return true;
  });

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable
          onPress={handleClose}
          style={StyleSheet.absoluteFillObject}
        />
        <Animated.View
          style={[
            styles.container,
            {
              height: screenHeight * 0.5, // 50% height as requested
              transform: [
                { translateY: slideAnim },
                { translateY: Animated.multiply(keyboardOffset, -1) },
              ],
            },
          ]}
        >
          <View style={styles.handle} />
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled={true}
          >
            <View style={styles.header}>
              <View style={styles.headerContent}>
                {/* Icon on the left */}
                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => {
                    setShowIconPicker(!showIconPicker);
                    setIsEditingName(false);
                  }}
                  activeOpacity={0.7}
                >
                  {iconDisplay.type === "emoji" ? (
                    <Text style={styles.headerIconEmoji}>{iconDisplay.value}</Text>
                  ) : (
                    <Ionicons
                      name={iconDisplay.value}
                      size={28}
                      color={category?.color || "#4A90E2"}
                      style={styles.headerIconIonicon}
                    />
                  )}
                </TouchableOpacity>
                
                {/* Category name - editable */}
                <View style={styles.headerNameContainer}>
                  {isEditingName ? (
                    <TextInput
                      ref={nameInputRef}
                      style={styles.headerNameInput}
                      value={editingName}
                      onChangeText={setEditingName}
                      onBlur={() => {
                        handleNameUpdate(editingName);
                        setShowIconPicker(false);
                      }}
                      onSubmitEditing={() => {
                        handleNameUpdate(editingName);
                        setShowIconPicker(false);
                      }}
                      autoFocus
                      selectTextOnFocus
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.headerNameButton}
                      onPress={() => {
                        setIsEditingName(true);
                        setShowIconPicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.title} numberOfLines={1}>
                        {currentCategory?.category || category?.category || "Category"}
                      </Text>
                      <Ionicons
                        name="pencil-outline"
                        size={18}
                        color="rgba(255,255,255,0.6)"
                        style={styles.pencilIcon}
                      />
                    </TouchableOpacity>
                  )}
                  {parentLabel && (
                    <Text style={styles.subtitle}>Child of {parentLabel}</Text>
                  )}
                </View>
              </View>
            </View>
            
            {/* Icon Picker Section */}
            {showIconPicker && (
              <Animated.View
                style={[
                  styles.iconPickerContainer,
                  {
                    opacity: iconPickerAnim,
                    transform: [
                      {
                        translateY: Animated.multiply(
                          iconPickerAnim,
                          new Animated.Value(-10)
                        ),
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.iconPickerLabel}>CHOOSE ICON</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.iconScroll}
                  contentContainerStyle={styles.iconScrollContent}
                  bounces={false}
                >
                  {CURATED_ICONS.map((icon, index) => {
                    const isSelected = currentIcon === icon.value;
                    return (
                      <TouchableOpacity
                        key={`${icon.type}-${icon.value}-${index}`}
                        style={[
                          styles.iconOption,
                          isSelected && styles.iconOptionSelected,
                        ]}
                        onPress={() => handleIconUpdate(icon.value)}
                        activeOpacity={0.7}
                      >
                        {icon.type === "emoji" ? (
                          <Text style={styles.iconEmojiRow}>{icon.value}</Text>
                        ) : (
                          <Ionicons
                            name={icon.value as keyof typeof Ionicons.glyphMap}
                            size={20}
                            color="#fff"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            )}

                {mode === "edit" ? (
                  <>
                    {/* Budget section */}
                    <View style={styles.section}>
                      <Text style={styles.label}>Budget limit</Text>
                      <View style={styles.inputRow}>
                        <Text style={styles.prefix}>$</Text>
                        <TextInput
                          ref={amountInputRef}
                          style={styles.input}
                          keyboardType="decimal-pad"
                          value={amount}
                          onChangeText={setAmount}
                          placeholder="0"
                          placeholderTextColor="rgba(255,255,255,0.4)"
                        />
                        {hasBudgetChanged && (
                          <TouchableOpacity
                            onPress={handleSave}
                            activeOpacity={0.7}
                            delayPressIn={0}
                            style={styles.saveButtonInline}
                          >
                            <LinearGradient
                              colors={["#215896", "#4991e3"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.saveButtonInlineGradient}
                            >
                              <Text style={styles.saveButtonInlineText}>Save</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {(onGroupPress ||
                      groupOptions.length > 0 ||
                      onDeletePress) && <View style={styles.divider} />}

                    {(onGroupPress || groupOptions.length > 0) && (
                      <TouchableOpacity
                        onPress={() => setMode("group")}
                        activeOpacity={0.85}
                        style={styles.actionRow}
                      >
                        <View style={styles.actionIconBox}>
                          <Ionicons
                            name="git-merge-outline"
                            size={18}
                            color="#4A90E2"
                          />
                        </View>
                        <View style={styles.actionTextBox}>
                          <Text style={styles.actionTitle}>
                            Group with another category
                          </Text>
                          <Text style={styles.actionSubtitle}>
                            {filteredGroupOptions.length > 0
                              ? `${filteredGroupOptions.length} categories available`
                              : "Combine this into a parent category"}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="rgba(255,255,255,0.5)"
                        />
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    {/* Group mode */}
                    <View style={styles.groupModeHeader}>
                      <TouchableOpacity
                        onPress={() => setMode("edit")}
                        style={styles.backButton}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="arrow-back" size={20} color="#4A90E2" />
                        <Text style={styles.backButtonText}>Edit Budget</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.groupSection}>
                      <Text style={styles.groupSectionTitle}>
                        Group under category
                      </Text>
                      {filteredGroupOptions.length === 0 ? (
                        <View style={styles.emptyGroupState}>
                          <Text style={styles.emptyGroupText}>
                            No other categories available for grouping
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.groupOptionsList}>
                          {filteredGroupOptions.map((option) => {
                            // Use same icon display logic as BudgetView
                            const getCategoryIconDisplay = (
                              iconValue?: string | null,
                              defaultColor?: string
                            ) => {
                              if (iconValue) {
                                const emojiRegex =
                                  /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
                                if (emojiRegex.test(iconValue)) {
                                  return {
                                    type: "emoji" as const,
                                    value: iconValue,
                                  };
                                }
                                return {
                                  type: "ionicon" as const,
                                  value:
                                    iconValue as keyof typeof Ionicons.glyphMap,
                                };
                              }
                              return { type: "emoji" as const, value: "💰" };
                            };

                            const iconDisplay = getCategoryIconDisplay(
                              option.icon,
                              option.color
                            );

                            return (
                              <TouchableOpacity
                                key={option.categoryId || option.category}
                                style={styles.groupChip}
                                activeOpacity={0.85}
                                onPress={() =>
                                  option.categoryId &&
                                  handleGroup(option.categoryId)
                                }
                              >
                                {iconDisplay.type === "emoji" ? (
                                  <Text style={styles.groupChipIconEmoji}>
                                    {iconDisplay.value}
                                  </Text>
                                ) : (
                                  <Ionicons
                                    name={iconDisplay.value}
                                    size={18}
                                    color={option.color || "#4A90E2"}
                                    style={styles.groupChipIconIonicon}
                                  />
                                )}
                                <Text
                                  style={styles.groupChipText}
                                  numberOfLines={1}
                                >
                                  {option.category}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {category.parentCategoryId && onRemoveGrouping && (
                        <>
                          <View style={styles.divider} />
                          <TouchableOpacity
                            style={[styles.actionRow, styles.destructiveRow]}
                            activeOpacity={0.85}
                            onPress={handleRemoveGroup}
                          >
                            <View
                              style={[
                                styles.actionIconBox,
                                styles.destructiveIconBox,
                              ]}
                            >
                              <Ionicons
                                name="unlink-outline"
                                size={22}
                                color="#FF6B6B"
                              />
                            </View>
                            <View style={styles.actionTextBox}>
                              <Text
                                style={[
                                  styles.actionTitle,
                                  styles.destructiveText,
                                ]}
                              >
                                Remove from group
                              </Text>
                              <Text style={styles.actionSubtitle}>
                                Detach from its parent category
                              </Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color="#FF6B6B"
                            />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </>
                )}

                {onDeletePress && mode === "edit" && (
                  <>
                    <View style={styles.divider} />
                    <TouchableOpacity
                      onPress={handleDelete}
                      activeOpacity={0.85}
                      style={[styles.actionRow, styles.destructiveRow]}
                    >
                      <View
                        style={[
                          styles.actionIconBox,
                          styles.destructiveIconBox,
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#FF6B6B"
                        />
                      </View>
                      <View style={styles.actionTextBox}>
                        <Text
                          style={[styles.actionTitle, styles.destructiveText]}
                        >
                          Delete category
                        </Text>
                        <Text style={styles.actionSubtitle}>
                          Hide this category from your budget
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="rgba(255,255,255,0.5)"
                      />
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    width: "100%",
    overflow: "hidden",
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 12,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerIconEmoji: {
    fontSize: 28,
  },
  headerIconIonicon: {
    // No additional styles needed
  },
  headerNameContainer: {
    flex: 1,
    alignItems: "flex-start",
  },
  headerNameButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  headerNameInput: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pencilIcon: {
    marginLeft: 8,
    paddingRight: 4,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginTop: 4,
  },
  iconPickerContainer: {
    marginBottom: 16,
    marginTop: 8,
  },
  iconPickerLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  iconScroll: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
  },
  iconScrollContent: {
    gap: 12,
    paddingRight: 18,
    paddingTop: 5,
    paddingBottom: 5,
  },
  iconOption: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    transform: [{ scale: 1.05 }],
  },
  iconEmojiRow: {
    fontSize: 20,
  },
  section: {
    marginTop: 4,
    marginBottom: 8,
  },
  label: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  prefix: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  saveButtonInline: {
    borderRadius: 8,
    overflow: "hidden",
  },
  saveButtonInlineGradient: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonInlineText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    paddingHorizontal: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    marginTop: 6,
  },
  actionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(74,144,226,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  actionTextBox: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  actionSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  destructiveRow: {
    marginTop: 8,
    backgroundColor: "rgba(255,107,107,0.06)",
    borderColor: "rgba(255,107,107,0.24)",
  },
  destructiveIconBox: {
    backgroundColor: "rgba(255,107,107,0.16)",
  },
  destructiveText: {
    color: "#FF6B6B",
  },
  // Group mode styles
  groupModeHeader: {
    marginBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backButtonText: {
    color: "#4A90E2",
    fontWeight: "600",
    fontSize: 15,
  },
  groupSection: {
    flex: 1,
  },
  groupSectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  emptyGroupState: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyGroupText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
  },
  groupOptionsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 6,
  },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: 6,
    minHeight: 36,
  },
  groupChipIconEmoji: {
    fontSize: 16,
  },
  groupChipIconIonicon: {
    marginRight: 0,
  },
  groupChipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 150,
  },
});

export default CategoryEditModal;
