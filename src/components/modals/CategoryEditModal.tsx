import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  TextInput,
  Animated,
  Easing,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface CategoryLike {
  category: string;
  categoryId?: string | null;
  color: string;
  budget: number;
  entryId?: string | null;
  parentCategoryId?: string | null;
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
}) => {
  const [amount, setAmount] = useState<string>(
    category ? Math.round(category.budget).toString() : ""
  );
  const [mode, setMode] = useState<"edit" | "group">("edit");
  const screenHeight = Dimensions.get("window").height;
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const [rendered, setRendered] = useState(visible);
  const [currentCategory, setCurrentCategory] = useState(category);

  useEffect(() => {
    if (visible && category) {
      setCurrentCategory(category);
      setAmount(category ? Math.round(category.budget).toString() : "");
      setMode("edit"); // Reset to edit mode when modal opens
      setRendered(true);
      slideAnim.setValue(screenHeight);
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

  // Use category prop directly instead of currentCategory to avoid timing issues
  if (!visible || !category) return null;

  const parseAmount = () => {
    const next = parseFloat(amount);
    return isNaN(next) || next < 0 ? null : next;
  };

  const handleSave = async () => {
    const parsed = parseAmount();
    if (parsed === null) return;

    // Don't show loading - optimistic update handles UI instantly
    // Close modal immediately for instant feedback
    onClose();

    // Save in background (optimistic update already handled in parent)
    // Fire and forget - parent handles rollback on failure
    onSave(parsed).catch(() => {
      // Error handling is done in parent component
    });
  };

  const handleGroup = async (parentCategoryId: string) => {
    if (!category.categoryId || !onGroupCategory) return;
    await onGroupCategory(category.categoryId, parentCategoryId);
    onClose();
  };

  const handleRemoveGroup = async () => {
    if (!category.categoryId || !onRemoveGrouping) return;
    await onRemoveGrouping(category.categoryId);
    onClose();
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
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.container,
                {
                  height: screenHeight * 0.5, // 50% height as requested
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.handle} />
              <ScrollView
                style={styles.scrollContent}
                contentContainerStyle={styles.scrollContentContainer}
                showsVerticalScrollIndicator={true}
              >
                <View style={styles.header}>
                  <View style={styles.headerContent}>
                    <Text style={styles.title}>
                      {currentCategory?.category ||
                        category?.category ||
                        "Category"}
                    </Text>
                    {parentLabel && (
                      <Text style={styles.subtitle}>
                        Child of {parentLabel}
                      </Text>
                    )}
                  </View>
                </View>

                {mode === "edit" ? (
                  <>
                    {/* Budget section */}
                    <View style={styles.section}>
                      <Text style={styles.label}>Budget limit</Text>
                      <View style={styles.inputRow}>
                        <Text style={styles.prefix}>$</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="decimal-pad"
                          value={amount}
                          onChangeText={setAmount}
                          placeholder="0"
                          placeholderTextColor="rgba(255,255,255,0.4)"
                        />
                      </View>
                      <View style={styles.actions}>
                        <Text style={styles.cancel} onPress={onClose}>
                          Cancel
                        </Text>
                        <Text style={styles.save} onPress={handleSave}>
                          Save
                        </Text>
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
    alignItems: "center",
    width: "100%",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
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
  },
  prefix: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 16,
  },
  cancel: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
  },
  save: {
    color: "#4A90E2",
    fontWeight: "700",
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
