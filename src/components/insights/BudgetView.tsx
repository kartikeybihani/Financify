import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/src/lib/supabase/supabase";
import {
  BudgetData,
  CategoryTransaction,
  CategoryData,
  BudgetViewProps,
  CategoryBudgetCardProps,
  SubcategoryRowProps,
  CategoryActionSheetProps,
} from "@/src/types/budget";
import { getTransactionsForCategory } from "@/src/types/budget";
import CategoryTransactionsModal from "@/src/components/modals/CategoryTransactionsModal";
import CategoryEditModal from "@/src/components/modals/CategoryEditModal";
import logger from "@/src/utils/core/logger";

const BudgetView: React.FC<BudgetViewProps> = ({
  categoryBreakdown,
  onCategoryPress: _onCategoryPress,
  formatCategoryName,
  budgets = [],
  totalBudget: providedTotalBudget,
  totalSpent: providedTotalSpent,
  budgetSummary,
  onUpdateBudget,
  onDeleteBudget,
  onGroupCategory,
  onRemoveGrouping,
  onDeleteCategory,
  refreshBudget,
}) => {
  // Optimistic updates: track local budget changes before DB sync
  const [optimisticBudgets, setOptimisticBudgets] = useState<
    BudgetData[] | null
  >(null);

  // Use provided totals if available (from real budget data), otherwise calculate from categoryBreakdown
  const totalSpent =
    providedTotalSpent !== undefined
      ? providedTotalSpent
      : categoryBreakdown.reduce((sum, [_, data]) => sum + data.amount, 0);

  // Use optimistic budgets if available, otherwise use provided budgets
  let finalBudgets: BudgetData[] =
    optimisticBudgets || (budgets.length > 0 ? budgets : []);

  if (finalBudgets.length === 0) {
    // Build a fallback budget list from spending breakdown if no budgets are set
    const budgetMap = new Map<string, BudgetData>();
    categoryBreakdown.forEach(([category, data]) => {
      budgetMap.set(category, {
        category,
        spent: data.amount,
        budget: Math.round(data.amount * 1.2),
        color: data.color,
      });
    });
    finalBudgets = Array.from(budgetMap.values());
  }

  // Calculate total budget: prefer provided total, otherwise sum of entries (roots include their children totals)
  // If using optimistic budgets, recalculate total from them
  const totalBudget =
    providedTotalBudget !== undefined && optimisticBudgets === null
      ? providedTotalBudget
      : finalBudgets.reduce((sum, b) => sum + b.budget, 0);

  const remaining = totalBudget - totalSpent;
  const budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Get status color based on progress
  const getStatusColor = (progress: number) => {
    if (progress < 70) return "#4ECDC4"; // Green - on track
    if (progress < 90) return "#FFB84D"; // Yellow - getting close
    if (progress < 100) return "#FF9500"; // Orange - warning
    return "#FF6B6B"; // Red - over budget
  };

  const getStatusEmoji = (progress: number) => {
    if (progress < 70) return "✨";
    if (progress < 90) return "⚡";
    if (progress < 100) return "⚠️";
    return "🚨";
  };

  const getStatusText = (progress: number) => {
    if (progress < 70) return "On Track";
    if (progress < 90) return "Watch It";
    if (progress < 100) return "Almost There";
    return "Over Budget";
  };

  const statusColor = getStatusColor(budgetProgress);
  const statusEmoji = getStatusEmoji(budgetProgress);
  const statusText = getStatusText(budgetProgress);

  // Sort categories by budget amount (highest first)
  const sortedBudgets = [...finalBudgets].sort((a, b) => b.budget - a.budget);
  

  const actionOptions: BudgetData[] = [];
  finalBudgets.forEach((item) => {
    actionOptions.push(item);
    if (item.children?.length) {
      actionOptions.push(...item.children);
    }
  });

  // Create a map of categoryId to entry ID for edit/delete
  const categoryToEntry = new Map<
    string,
    { entryId: string; categoryId: string }
  >();
  if (budgetSummary?.entries) {
    budgetSummary.entries
      .filter((e: any) => e.scope_type === "category" && e.category_id)
      .forEach((entry: any) => {
        const categoryId = entry.category_id;
        if (categoryId) {
          categoryToEntry.set(categoryId, {
            entryId: entry.id,
            categoryId: categoryId,
          });
        }
      });
  }

  const [actionVisible, setActionVisible] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    item: BudgetData;
    parentLabel?: string | null;
  } | null>(null);
  useEffect(() => {
    if (!actionVisible) {
      const timer = setTimeout(() => setActionTarget(null), 220);
      return () => clearTimeout(timer);
    }
  }, [actionVisible]);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
    new Set()
  );
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txList, setTxList] = useState<CategoryTransaction[]>([]);
  const [txTarget, setTxTarget] = useState<{
    item: BudgetData;
    parentLabel?: string | null;
  } | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<BudgetData | null>(null);
  const [editParentLabel, setEditParentLabel] = useState<string | null>(null);
  // Track which categories are currently loading (for per-row loading state)
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(
    new Set()
  );

  const openActions = (item: BudgetData, parentLabel?: string | null) => {
    setActionTarget({ item, parentLabel: parentLabel || null });
    setActionVisible(true);
  };

  const closeActions = () => {
    setActionVisible(false);
    setActionTarget(null);
  };

  const toggleCollapse = (id: string | null | undefined) => {
    if (!id) return;
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openTransactions = async (
    item: BudgetData,
    parentLabel?: string | null
  ) => {
    setTxTarget({ item, parentLabel: parentLabel || null });
    setActionTarget({ item, parentLabel: parentLabel || null });
    setTxModalVisible(true);
    setTxLoading(true);
    setTxError(null);
    setTxList([]);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setTxError("Not signed in");
        setTxLoading(false);
        return;
      }
      const txs = await getTransactionsForCategory(user.id, item.category);
      setTxList(txs);
    } catch (err) {
      setTxError("Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  };

  const closeTransactions = () => {
    setTxModalVisible(false);
    setTxTarget(null);
    setTxError(null);
  };

  const openEdit = (item: BudgetData, parentLabel?: string | null) => {
    setEditTarget(item);
    setEditParentLabel(parentLabel || null);
    setEditModalVisible(true);
  };

  const closeEdit = () => {
    setEditModalVisible(false);
    setEditTarget(null);
    setEditParentLabel(null);
  };

  // Helper to get loading key for a category (prefer categoryId, fallback to entryId)
  const getLoadingKey = (categoryId: string | null | undefined, entryId?: string | null): string | null => {
    if (categoryId) return `category_${categoryId}`;
    if (entryId) return `entry_${entryId}`;
    return null;
  };

  // Helper to set loading state for a category
  const setCategoryLoading = (categoryId: string | null | undefined, entryId: string | null | undefined, isLoading: boolean) => {
    const key = getLoadingKey(categoryId, entryId);
    if (!key) return;

    setLoadingCategories((prev) => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  // Helper to check if a category is loading
  const isCategoryLoading = (categoryId: string | null | undefined, entryId?: string | null): boolean => {
    const key = getLoadingKey(categoryId, entryId);
    return key ? loadingCategories.has(key) : false;
  };

  return (
    <View style={styles.container}>
      {/* Glassy Summary Header Box */}
      <View style={styles.glassHeader}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryLabel}>Monthly Budget</Text>
            <Text style={styles.summaryAmount}>
              ${totalBudget.toLocaleString()}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: `${statusColor}15` },
            ]}
          >
            <Text style={styles.statusEmoji}>{statusEmoji}</Text>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Compact Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(budgetProgress, 100)}%`,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressLabel}>
              ${totalSpent.toLocaleString()} spent
            </Text>
            <Text
              style={[
                styles.progressRemaining,
                { color: remaining >= 0 ? "#4ECDC4" : "#FF6B6B" },
              ]}
            >
              ${Math.abs(remaining).toLocaleString()}{" "}
              {remaining >= 0 ? "left" : "over"}
            </Text>
          </View>
        </View>
      </View>

      {/* Compact Categories List - No ScrollView, No Header */}
      {sortedBudgets.length > 0 ? (
        <View style={styles.categoriesBox}>
          {/* Header Row with Labels */}
          <View style={styles.progressBarHeader}>
            <View style={styles.spacer} />
            <View style={styles.progressBarHeaderSection}>
              <View style={styles.headerAmountContainer}>
                <Text style={styles.headerAmountLabel}>SPENT</Text>
              </View>
              <View style={styles.headerSpacer} />
              <View style={styles.headerAmountContainer}>
                <Text style={styles.headerAmountLabel}>BUDGET</Text>
              </View>
            </View>
          </View>
          <View style={styles.categoriesList}>
            {sortedBudgets.map((budget, index) => {
              const categoryProgress =
                budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0;
              const categoryStatusColor = getStatusColor(categoryProgress);
              const isOverBudget = categoryProgress >= 100;

              const entryInfo = budget.categoryId ? categoryToEntry.get(budget.categoryId) : null;
              const cardEntryId = budget.entryId || entryInfo?.entryId;
              const cardCategoryId = budget.categoryId || null;
              const children = budget.children || [];
              const isLoadingCard = isCategoryLoading(cardCategoryId, cardEntryId);

              // CRITICAL: Always include index to ensure uniqueness, even when categoryId exists
              // This prevents duplicate keys when multiple budgets share the same categoryId
              const uniqueKey = cardCategoryId
                ? `${cardCategoryId}-${index}`
                : `${budget.category}-${index}`;

              return (
                <View key={uniqueKey}>
                  <CategoryBudgetCard
                    category={budget.category}
                    spent={budget.spent}
                    budget={budget.budget}
                    progress={categoryProgress}
                    color={budget.color}
                    icon={budget.icon}
                    statusColor={categoryStatusColor}
                    isOverBudget={isOverBudget}
                    formatCategoryName={formatCategoryName}
                    entryId={cardEntryId || undefined}
                    categoryId={cardCategoryId}
                    hasChildren={children.length > 0}
                    isCollapsed={
                      cardCategoryId
                        ? collapsedParents.has(cardCategoryId)
                        : false
                    }
                    onToggleCollapse={() => toggleCollapse(cardCategoryId)}
                    onPress={() => {
                      openTransactions(budget);
                    }}
                    onEdit={undefined}
                    onDelete={undefined}
                    delay={index * 30}
                    onOpenActions={() => openTransactions(budget)}
                    isLoading={isLoadingCard}
                  />
                  {children.length > 0 &&
                    (() => {
                      const isExpanded = !(
                        cardCategoryId && collapsedParents.has(cardCategoryId)
                      );
                      return (
                        <AnimatedSubcategoriesContainer isExpanded={isExpanded}>
                          {children.map((child, childIndex) => {
                            const childProgress =
                              child.budget > 0
                                ? (child.spent / child.budget) * 100
                                : 0;
                            const childStatusColor =
                              getStatusColor(childProgress);
                            const isLoadingChild = isCategoryLoading(child.categoryId, child.entryId);
                            // CRITICAL: Always include childIndex to ensure uniqueness, even when categoryId exists
                            // This prevents duplicate keys when multiple children share the same categoryId
                            const childUniqueKey = child.categoryId
                              ? `${child.categoryId}-${index}-${childIndex}`
                              : `${budget.category}-${child.category}-${index}-${childIndex}`;
                            return (
                              <SubcategoryRow
                                key={childUniqueKey}
                                item={child}
                                statusColor={childStatusColor}
                                formatCategoryName={formatCategoryName}
                                onOpenActions={() =>
                                  openTransactions(child, budget.category)
                                }
                                isLoading={isLoadingChild}
                              />
                            );
                          })}
                        </AnimatedSubcategoriesContainer>
                      );
                    })()}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={32} color="#666" />
          <Text style={styles.emptyText}>No budgets set</Text>
        </View>
      )}

      <CategoryActionSheet
        visible={actionVisible}
        category={actionTarget?.item || null}
        parentLabel={actionTarget?.parentLabel || undefined}
        categories={actionOptions}
        onClose={closeActions}
        onEditRequest={(item) => {
          closeActions();
          openEdit(item, actionTarget?.parentLabel || null);
        }}
        onGroupCategory={onGroupCategory}
        onRemoveGrouping={onRemoveGrouping}
        onDeleteCategory={onDeleteCategory}
      />
      <CategoryTransactionsModal
        visible={txModalVisible}
        category={txTarget?.item || null}
        parentLabel={txTarget?.parentLabel || null}
        transactions={txList}
        loading={txLoading}
        error={txError}
        onClose={closeTransactions}
        onManage={() => {
          if (!txTarget) return;
          const target = txTarget;
          // Store the target data before closing
          const itemToEdit = target.item;
          const parentToEdit = target.parentLabel;

          // Close transactions modal first
          closeTransactions();

          // Use requestAnimationFrame to ensure state update completes,
          // then wait for modal close animation (250ms) before opening edit modal
          requestAnimationFrame(() => {
            setTimeout(() => {
              openEdit(itemToEdit, parentToEdit || null);
            }, 260);
          });
        }}
      />
      <CategoryEditModal
        visible={editModalVisible}
        category={editTarget}
        parentLabel={editParentLabel}
        onClose={closeEdit}
        setCategoryLoading={setCategoryLoading}
        refreshBudget={refreshBudget}
        onNameUpdate={async (categoryId: string, newName: string) => {
          if (!categoryId) return false;
          
          try {
            const baseSlug = newName
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, "")
              .replace(/\s+/g, "-")
              .trim();
            
            // Update category name and slug
            const { error: categoryError } = await supabase
              .from("categories")
              .update({ 
                name: newName,
                slug: baseSlug,
              })
              .eq("id", categoryId);
            
            if (categoryError) {
              return false;
            }
            
            // Update label in all budget_entries for this category
            const { error: entriesError } = await supabase
              .from("budget_entries")
              .update({ label: newName })
              .eq("category_id", categoryId)
              .eq("scope_type", "category");
            
            if (entriesError) {
              // Don't fail the whole operation
            }
            
            // Refresh budget data to reflect changes
            // Small delay to ensure database updates are committed
            if (refreshBudget) {
              await new Promise(resolve => setTimeout(resolve, 100));
              await refreshBudget();
            }
            
            return true;
          } catch (error) {
            return false;
          }
        }}
        onIconUpdate={async (categoryId: string, newIcon: string) => {
          if (!categoryId) return false;
          
          try {
            const { error } = await supabase
              .from("categories")
              .update({ icon: newIcon })
              .eq("id", categoryId);
            
            if (error) {
              return false;
            }
            
            // Refresh budget data to reflect changes
            if (refreshBudget) {
              await refreshBudget();
            }
            
            return true;
          } catch (error) {
            return false;
          }
        }}
        onSave={async (amount) => {
          if (!editTarget || !onUpdateBudget) return false;

          // Set loading state for this category
          setCategoryLoading(editTarget.categoryId, editTarget.entryId, true);

          // OPTIMISTIC UPDATE: Update UI immediately
          const updatedBudgets = finalBudgets.map((budget) => {
            // Match by categoryId or category name
            const matches =
              (editTarget.categoryId &&
                budget.categoryId === editTarget.categoryId) ||
              (!editTarget.categoryId &&
                budget.category === editTarget.category);

            if (matches) {
              return { ...budget, budget: amount };
            }

            // Also update parent budgets if this is a child category
            if (budget.children) {
              const updatedChildren = budget.children.map((child) => {
                const childMatches =
                  (editTarget.categoryId &&
                    child.categoryId === editTarget.categoryId) ||
                  (!editTarget.categoryId &&
                    child.category === editTarget.category);

                if (childMatches) {
                  return { ...child, budget: amount };
                }
                return child;
              });

              // Recalculate parent budget from children
              const childrenTotal = updatedChildren.reduce(
                (sum, child) => sum + child.budget,
                0
              );

              return {
                ...budget,
                children: updatedChildren,
                budget: childrenTotal,
              };
            }

            return budget;
          });

          // Set optimistic state immediately
          setOptimisticBudgets(updatedBudgets);

          // Close modal immediately for instant feedback
          closeEdit();

          // Update database in background (fire and forget with error handling)
          (async () => {
            try {
              const success = await onUpdateBudget(
                editTarget.categoryId || null,
                editTarget.category,
                amount,
                editTarget.color
              );

              if (!success) {
                // Rollback on failure - revert to original budgets
                setOptimisticBudgets(null);
              } else {
                // Clear optimistic state after successful DB update
                // The refreshBudget will update with real data
                setTimeout(() => {
                  setOptimisticBudgets(null);
                }, 500);
              }
            } catch (error) {
              // Rollback on error
              setOptimisticBudgets(null);
            } finally {
              // Clear loading state
              setCategoryLoading(editTarget.categoryId, editTarget.entryId, false);
            }
          })();

          return true; // Return immediately for instant UI
        }}
        groupOptions={actionOptions}
        onGroupCategory={onGroupCategory}
        onRemoveGrouping={onRemoveGrouping}
        onDeletePress={async () => {
          if (!editTarget || !onDeleteCategory || !editTarget.categoryId) {
            return;
          }
          
          // Set loading state for this category
          setCategoryLoading(editTarget.categoryId, editTarget.entryId, true);

          try {
            const success = await onDeleteCategory(
              editTarget.categoryId,
              editTarget.entryId || null
            );
            if (success) {
              closeEdit();
              setOptimisticBudgets(null);
              if (refreshBudget) {
                await refreshBudget();
              }
            }
          } catch (error) {
            // Error handled silently
          } finally {
            setCategoryLoading(editTarget.categoryId, editTarget.entryId, false);
          }
        }}
      />
    </View>
  );
};

// Animated Subcategories Container Component
interface AnimatedSubcategoriesContainerProps {
  children: React.ReactNode;
  isExpanded: boolean;
}

const AnimatedSubcategoriesContainer: React.FC<
  AnimatedSubcategoriesContainerProps
> = ({ children, isExpanded }) => {
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleYAnim = useRef(new Animated.Value(0)).current;
  const contentHeightRef = useRef(0);
  const [isMeasured, setIsMeasured] = useState(false);

  // Measure content height when first rendered or when expanded
  const handleContentLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && contentHeightRef.current !== height) {
      contentHeightRef.current = height;
      if (!isMeasured) {
        setIsMeasured(true);
        // Set initial values based on expanded state
        if (isExpanded) {
          // If expanded, set to full height immediately
          heightAnim.setValue(height);
          opacityAnim.setValue(1);
          scaleYAnim.setValue(1);
        } else {
          // If collapsed, ensure height is 0
          heightAnim.setValue(0);
          opacityAnim.setValue(0);
          scaleYAnim.setValue(0);
        }
      }
    }
  };

  // Handle initial expanded state - if expanded and we have height, show immediately
  useEffect(() => {
    if (isExpanded && contentHeightRef.current > 0 && !isMeasured) {
      heightAnim.setValue(contentHeightRef.current);
      opacityAnim.setValue(1);
      scaleYAnim.setValue(1);
      setIsMeasured(true);
    }
  }, [isExpanded, contentHeightRef.current]);

  useEffect(() => {
    if (!isMeasured) return; // Wait for initial measurement

    // When animating height, ALL animations must use useNativeDriver: false
    // Height is not supported by native driver, so opacity and scaleY must also use JS driver
    if (isExpanded) {
      // Expanding: all animations use JS driver since height is involved
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: contentHeightRef.current,
          duration: 300,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // Must match height animation driver
        }),
        Animated.sequence([
          Animated.timing(scaleYAnim, {
            toValue: 1.08, // Slight overshoot for bounce effect
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false, // Must match height animation driver
          }),
          Animated.spring(scaleYAnim, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: false, // Must match height animation driver
          }),
        ]),
      ]).start();
    } else {
      // Collapsing: all animations use JS driver
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false, // Must match height animation driver
        }),
        Animated.timing(scaleYAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false, // Must match height animation driver
        }),
      ]).start();
    }
  }, [isExpanded, isMeasured]);

  return (
    <>
      {/* Hidden measurement view - always rendered to get accurate height */}
      <View
        style={{
          position: "absolute",
          opacity: 0,
          zIndex: -1,
          width: "100%",
        }}
        onLayout={handleContentLayout}
      >
        {children}
      </View>
      {/* Visible animated container */}
      <Animated.View
        style={[
          styles.subcategoriesContainer,
          {
            height: heightAnim,
            opacity: opacityAnim,
            transform: [
              {
                scaleY: scaleYAnim,
              },
            ],
            overflow: "hidden",
          },
        ]}
      >
        <View style={{ width: "100%" }}>{children}</View>
      </Animated.View>
    </>
  );
};

const SubcategoryRow: React.FC<SubcategoryRowProps> = ({
  item,
  statusColor,
  formatCategoryName,
  onOpenActions,
  isLoading = false,
}) => {
  // Animate opacity when loading state changes
  const loadingOpacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(loadingOpacityAnim, {
      toValue: isLoading ? 0.5 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isLoading, loadingOpacityAnim]);
  const iconDisplay = (() => {
    if (item.icon) {
      const emojiRegex =
        /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
      if (emojiRegex.test(item.icon)) {
        return { type: "emoji" as const, value: item.icon };
      }
      return {
        type: "ionicon" as const,
        value: item.icon as keyof typeof Ionicons.glyphMap,
      };
    }
    return { type: "emoji" as const, value: "🔹" };
  })();

  const progress = item.budget > 0 ? (item.spent / item.budget) * 100 : 0;

  return (
    <Animated.View
      style={[
        styles.subcategoryCard,
        {
          opacity: loadingOpacityAnim,
        },
      ]}
    >
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onOpenActions}
      disabled={isLoading}
    >
      <View style={styles.subcategoryRow}>
        <View style={styles.subcategorySpacer}>
          <View
            style={[
              styles.subcategoryDot,
              { backgroundColor: item.color || "#4A90E2" },
            ]}
          />
        </View>
        {iconDisplay.type === "emoji" ? (
          <Text style={styles.subcategoryIconEmoji}>{iconDisplay.value}</Text>
        ) : (
          <Ionicons
            name={iconDisplay.value}
            size={16}
            color={item.color}
            style={styles.subcategoryIconIonicon}
          />
        )}
        <Text style={styles.subcategoryName} numberOfLines={1}>
          {formatCategoryName(item.category)}
        </Text>
        <View style={styles.spacer} />
        <View style={styles.progressBarSection}>
          <Text style={styles.progressAmountLeft}>
            ${item.spent.toLocaleString()}
          </Text>
          <View style={styles.categoryProgressBarBackground}>
            <Animated.View
              style={[
                styles.categoryProgressBarFill,
                {
                  width: `${Math.min(progress, 100)}%`,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>
          <Text style={styles.progressAmountRight}>
            ${item.budget.toLocaleString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
    </Animated.View>
  );
};

const CategoryActionSheet: React.FC<CategoryActionSheetProps> = ({
  visible,
  category,
  parentLabel,
  categories,
  onClose,
  onEditRequest,
  onGroupCategory,
  onRemoveGrouping,
  onDeleteCategory,
}) => {
  const translateY = useRef(new Animated.Value(400)).current;
  const [renderSheet, setRenderSheet] = useState(visible);
  const [activeCategory, setActiveCategory] = useState(category);

  useEffect(() => {
    if (visible && category) {
      setActiveCategory(category);
      setRenderSheet(true);
      translateY.setValue(400);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else if (renderSheet) {
      Animated.timing(translateY, {
        toValue: 400,
        duration: 180,
        useNativeDriver: true,
      }).start(() => setRenderSheet(false));
    }
  }, [visible, category, renderSheet, translateY]);

  if (!renderSheet || !activeCategory) return null;

  const handleGroup = async (parentCategoryId: string) => {
    if (!activeCategory.categoryId || !onGroupCategory) return;
    await onGroupCategory(activeCategory.categoryId, parentCategoryId);
    onClose();
  };

  const handleRemoveGroup = async () => {
    if (!activeCategory.categoryId || !onRemoveGrouping) return;
    await onRemoveGrouping(activeCategory.categoryId);
    onClose();
  };

  const handleDelete = async () => {
    if (!activeCategory.categoryId || !onDeleteCategory) return;
    await onDeleteCategory(activeCategory.categoryId, activeCategory.entryId);
    onClose();
  };

  const groupOptions = categories.filter((c) => {
    if (!c.categoryId) return false;
    if (c.categoryId === activeCategory.categoryId) return false;
    if (c.parentCategoryId === activeCategory.categoryId) return false;
    if (c.parentCategoryId) return false; // don't allow using an existing child as a parent
    return true;
  });

  return (
    <Modal
      transparent
      animationType="fade"
      visible={renderSheet}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[styles.sheetContainer, { transform: [{ translateY }] }]}
            >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{activeCategory.category}</Text>
                {parentLabel && (
                  <Text style={styles.sheetSubtitle}>
                    Child of {parentLabel}
                  </Text>
                )}
              </View>

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={styles.sheetActionButton}
                  activeOpacity={0.85}
                  onPress={() => onEditRequest && onEditRequest(activeCategory)}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255, 255, 255, 0.08)",
                      "rgba(255, 255, 255, 0.03)",
                    ]}
                    style={styles.sheetActionGradient}
                  >
                    <View style={styles.sheetActionContent}>
                      <View style={styles.sheetIconBox}>
                        <Ionicons
                          name="create-outline"
                          size={22}
                          color="#4A90E2"
                        />
                      </View>
                      <View style={styles.sheetActionTextBox}>
                        <Text style={styles.sheetActionTitle}>Edit budget</Text>
                        <Text style={styles.sheetActionSubtitle}>
                          Update limit for this category
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#4A90E2"
                      />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={styles.sheetModeTitle}>Group under</Text>

                <ScrollView
                  style={{ maxHeight: 200 }}
                  contentContainerStyle={{ gap: 12, paddingVertical: 6 }}
                >
                  {groupOptions.length === 0 ? (
                    <Text style={styles.sheetEmptyText}>
                      No other categories available
                    </Text>
                  ) : (
                    groupOptions.map((option) => (
                      <TouchableOpacity
                        key={option.categoryId || option.category}
                        style={styles.sheetActionButton}
                        activeOpacity={0.85}
                        onPress={() =>
                          option.categoryId && handleGroup(option.categoryId)
                        }
                      >
                        <LinearGradient
                          colors={[
                            "rgba(255, 255, 255, 0.08)",
                            "rgba(255, 255, 255, 0.03)",
                          ]}
                          style={styles.sheetActionGradient}
                        >
                          <View style={styles.sheetActionContent}>
                            <View
                              style={[
                                styles.sheetIconBox,
                                { backgroundColor: "rgba(74, 144, 226, 0.12)" },
                              ]}
                            >
                              <Ionicons
                                name="folder-outline"
                                size={20}
                                color="#4A90E2"
                              />
                            </View>
                            <View style={styles.sheetActionTextBox}>
                              <Text style={styles.sheetActionTitle}>
                                {option.category}
                              </Text>
                              <Text style={styles.sheetActionSubtitle}>
                                {option.budget > 0
                                  ? `$${option.budget.toLocaleString()} budget`
                                  : "No budget set"}
                              </Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color="#4A90E2"
                            />
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>

                {activeCategory.parentCategoryId && (
                  <TouchableOpacity
                    style={styles.sheetActionButton}
                    activeOpacity={0.85}
                    onPress={handleRemoveGroup}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(255, 255, 255, 0.08)",
                        "rgba(255, 255, 255, 0.03)",
                      ]}
                      style={styles.sheetActionGradient}
                    >
                      <View style={styles.sheetActionContent}>
                        <View
                          style={[
                            styles.sheetIconBox,
                            { backgroundColor: "rgba(255, 107, 107, 0.1)" },
                          ]}
                        >
                          <Ionicons
                            name="unlink-outline"
                            size={22}
                            color="#FF6B6B"
                          />
                        </View>
                        <View style={styles.sheetActionTextBox}>
                          <Text
                            style={[
                              styles.sheetActionTitle,
                              { color: "#FF6B6B" },
                            ]}
                          >
                            Remove from group
                          </Text>
                          <Text style={styles.sheetActionSubtitle}>
                            Detach from its parent category
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#FF6B6B"
                        />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetActionButton}
                  activeOpacity={0.85}
                  onPress={handleDelete}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255, 107, 107, 0.08)",
                      "rgba(255, 107, 107, 0.03)",
                    ]}
                    style={styles.sheetActionGradient}
                  >
                    <View style={styles.sheetActionContent}>
                      <View
                        style={[
                          styles.sheetIconBox,
                          { backgroundColor: "rgba(255, 107, 107, 0.12)" },
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={22}
                          color="#FF6B6B"
                        />
                      </View>
                      <View style={styles.sheetActionTextBox}>
                        <Text
                          style={[
                            styles.sheetActionTitle,
                            { color: "#FF6B6B" },
                          ]}
                        >
                          Delete category
                        </Text>
                        <Text style={styles.sheetActionSubtitle}>
                          Hide this category for you
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#FF6B6B"
                      />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// Individual Category Budget Card Component
const CategoryBudgetCard: React.FC<CategoryBudgetCardProps> = ({
  category,
  spent,
  budget,
  progress,
  color,
  icon,
  statusColor,
  isOverBudget,
  formatCategoryName,
  onPress,
  entryId,
  categoryId,
  onEdit,
  onDelete,
  delay,
  onOpenActions,
  hasChildren = false,
  isCollapsed = false,
  onToggleCollapse,
  isLoading = false,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const arrowScaleAnim = useRef(new Animated.Value(1)).current;
  const arrowOpacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  // Animate arrow when collapsing/expanding
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(arrowScaleAnim, {
          toValue: 0.85,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(arrowOpacityAnim, {
          toValue: 0.6,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(arrowScaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(arrowOpacityAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isCollapsed]);

  // Use icon from database if available, otherwise fallback to emoji or default
  const getCategoryIconDisplay = (
    iconValue?: string | null,
    defaultColor?: string
  ) => {
    if (iconValue) {
      // Check if it's an emoji (contains emoji unicode ranges)
      const emojiRegex =
        /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
      if (emojiRegex.test(iconValue)) {
        return { type: "emoji" as const, value: iconValue };
      }
      // Otherwise treat as Ionicons name
      return {
        type: "ionicon" as const,
        value: iconValue as keyof typeof Ionicons.glyphMap,
      };
    }
    // Fallback to default emoji
    return { type: "emoji" as const, value: "💰" };
  };

  const iconDisplay = getCategoryIconDisplay(icon, color);

  const remaining = budget - spent;
  const overspent = isOverBudget ? spent - budget : 0;

  // Animate opacity when loading state changes
  const loadingOpacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(loadingOpacityAnim, {
      toValue: isLoading ? 0.5 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isLoading, loadingOpacityAnim]);

  return (
    <Animated.View
      style={[
        styles.categoryCard,
        {
          opacity: Animated.multiply(fadeAnim, loadingOpacityAnim),
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onOpenActions}
        disabled={isLoading}
      >
        <View style={styles.categoryCardContent}>
          {/* Compact Row Layout */}
          <View style={styles.categoryRow}>
            {/* Left marker */}
            {hasChildren ? (
              <TouchableOpacity
                onPress={onToggleCollapse}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.dropdownTouchable}
                activeOpacity={0.7}
              >
                <Animated.View
                  style={[
                    {
                      transform: [{ scale: arrowScaleAnim }],
                      opacity: arrowOpacityAnim,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dropdownTriangle,
                      isCollapsed
                        ? styles.dropdownTriangleCollapsed
                        : styles.dropdownTriangleExpanded,
                    ]}
                  />
                </Animated.View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.dotIndicator, { backgroundColor: color }]} />
            )}

            {/* Category Content */}
            <View style={styles.categoryRowContent}>
              {/* Icon - No Box, Just Colorful Icon/Emoji */}
              {iconDisplay.type === "emoji" ? (
                <Text style={styles.categoryIconEmoji}>
                  {iconDisplay.value}
                </Text>
              ) : (
                <Ionicons
                  name={iconDisplay.value}
                  size={20}
                  color={color}
                  style={styles.categoryIconIonicon}
                />
              )}

              {/* Category Name */}
              <Text
                style={styles.categoryName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {formatCategoryName(category)}
              </Text>

              {/* Spacer to push progress bar to fixed position */}
              <View style={styles.spacer} />

              {/* Progress Bar Section - Fixed Width and Position (aligned from right) */}
              <View style={styles.progressBarSection}>
                {/* Spent Amount on Left */}
                <Text style={styles.progressAmountLeft}>
                  ${spent.toLocaleString()}
                </Text>

                {/* Progress Bar */}
                <View style={styles.categoryProgressBarBackground}>
                  <Animated.View
                    style={[
                      styles.categoryProgressBarFill,
                      {
                        width: `${Math.min(progress, 100)}%`,
                        backgroundColor: statusColor,
                      },
                    ]}
                  />
                </View>

                {/* Budget Amount on Right */}
                <Text style={styles.progressAmountRight}>
                  ${budget.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  // Glassy Header Box
  glassHeader: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Glass effect
    backdropFilter: "blur(10px)",
  },
  // Compact Summary Header
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLeft: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "500",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statusEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  // Compact Progress
  progressContainer: {
    marginBottom: 0,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: "#2a2a2a",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  progressRemaining: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Categories Box (glassy style)
  categoriesBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Glass effect
    backdropFilter: "blur(10px)",
  },
  // Compact Categories List
  categoriesList: {
    gap: 4,
  },
  categoryCard: {
    marginBottom: 0,
  },
  categoryCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    paddingRight: 0, // No right padding to ensure alignment
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  dropdownButton: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  dropdownButtonPlaceholder: {
    width: 20,
    marginRight: 6,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    marginLeft: 7,
  },
  dropdownIcon: {
    marginRight: 6,
    marginLeft: 7,
  },
  dropdownTouchable: {
    marginRight: 6,
    marginLeft: 7,
  },
  dropdownTriangle: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
  },
  dropdownTriangleCollapsed: {
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FF9500",
    borderRightColor: "transparent",
  },
  dropdownTriangleExpanded: {
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FF9500",
    borderBottomColor: "transparent",
  },
  categoryRowContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0, // Allow flex shrinking
    paddingRight: 0, // Ensure no extra padding
  },
  categoryIconEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  categoryIconIonicon: {
    marginRight: 10,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    marginRight: 8,
  },
  spacer: {
    flex: 1,
  },
  progressBarHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  progressBarHeaderSection: {
    flexDirection: "row",
    alignItems: "center",
    width: 175,
    gap: 6,
    flexShrink: 0,
    marginLeft: "auto",
  },
  headerAmountContainer: {
    minWidth: 35,
    alignItems: "center",
  },
  headerAmountLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 75,
  },
  progressBarSection: {
    flexDirection: "row",
    alignItems: "center",
    width: 175,
    gap: 6,
    flexShrink: 0, // Prevent shrinking
    marginLeft: "auto", // Push to right edge
    position: "relative",
  },
  progressAmountLeft: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    minWidth: 45,
    textAlign: "right",
  },
  progressAmountRight: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    minWidth: 45,
    textAlign: "left",
  },
  categoryProgressBarBackground: {
    height: 4,
    width: 75,
    backgroundColor: "#2a2a2a",
    borderRadius: 2,
    overflow: "hidden",
  },
  categoryProgressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  categoryFooter: {
    marginTop: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {
    flex: 1,
  },
  footerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  categoryRemaining: {
    fontSize: 11,
    fontWeight: "500",
  },
  // Subcategories - Same style as main category but smaller
  subcategoriesContainer: {
    marginTop: 0,
    paddingLeft: 40, // More indentation for subcategories (inner alignment)
    paddingTop: 0,
    paddingBottom: 0,
  },
  subcategoryCard: {
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 0,
    paddingRight: 0, // No right padding to ensure alignment
  },
  subcategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 0,
    minWidth: 0, // Allow flex shrinking
    paddingRight: 0, // Ensure no extra padding
  },
  subcategorySpacer: {
    width: 20, // width reserved for arrow/dot alignment
    marginRight: 6,
    alignItems: "center",
  },
  subcategoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subcategoryIconEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  subcategoryIconIonicon: {
    marginRight: 8,
  },
  subcategoryName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#DDD",
    marginRight: 8,
  },
  // Compact Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 13,
    color: "#888",
    marginTop: 8,
  },
  // Action sheet styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  sheetContainer: {
    width: "100%",
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sheetHeader: {
    marginBottom: 16,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  sheetSubtitle: {
    color: "rgba(255,255,255,0.65)",
    marginTop: 6,
    fontSize: 13,
  },
  sheetActions: {
    gap: 14,
    paddingBottom: 12,
  },
  sheetActionButton: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sheetActionGradient: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  sheetActionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(74, 144, 226, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetActionTextBox: {
    flex: 1,
    gap: 2,
  },
  sheetActionTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  sheetActionSubtitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
  sheetModeTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  amountPrefix: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  sheetButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
    paddingBottom: 10,
  },
  sheetSecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sheetSecondaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  sheetPrimaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#4A90E2",
  },
  sheetPrimaryText: {
    color: "#0b121a",
    fontWeight: "700",
  },
  sheetEmptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
});

export default BudgetView;
