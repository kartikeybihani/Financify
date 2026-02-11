import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated,
  DeviceEventEmitter,
  Dimensions,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useUnreviewedTransactions,
  UnreviewedTransaction,
} from "@/src/hooks/useUnreviewedTransactions";
import { getDisplayCategory } from "@/src/utils/categories/transactionCategory";
import { useCategories } from "@/src/hooks/useCategories";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";
import { Transaction } from "@/src/types/plaid";
import * as Haptics from "expo-haptics";
import AppStorage from "@/src/utils/storage/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const FIRST_TIME_MESSAGE_KEY = "transaction_review_first_time_shown";

interface TransactionReviewCardProps {
  userId?: string;
}

export function TransactionReviewCard({ userId }: TransactionReviewCardProps) {
  const {
    transactions,
    loading,
    count,
    markAsReviewed,
    markAllAsReviewed,
    refresh,
  } = useUnreviewedTransactions();

  const { getCategoryIcon, getCategoryColor, formatCategoryName } =
    useCategories(userId);
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<UnreviewedTransaction | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [slideAnimations, setSlideAnimations] = useState<
    Map<string, Animated.Value>
  >(new Map());
  const [categoryChangedIds, setCategoryChangedIds] = useState<Set<string>>(
    new Set(),
  );
  const [showFirstTimeMessage, setShowFirstTimeMessage] = useState(false);
  const [showThankYouMessage, setShowThankYouMessage] = useState(false);
  const [thankYouOpacity] = useState(new Animated.Value(0));
  const previousCountRef = useRef<number>(0);
  const countRef = useRef<number>(count);
  countRef.current = count;

  // Check if we should show the message (show it 2 times total)
  useEffect(() => {
    if (!loading && count > 0) {
      const timesShownStr = AppStorage.getItemSync(FIRST_TIME_MESSAGE_KEY);
      const timesShown = timesShownStr ? parseInt(timesShownStr, 10) : 0;

      if (timesShown < 2) {
        setShowFirstTimeMessage(true);
        // Increment the count
        AppStorage.setItemSync(FIRST_TIME_MESSAGE_KEY, String(timesShown + 1));
      }
    }
  }, [loading, count]);

  // Listen for category updates and remove transactions from list
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "transactionCategoryUpdated",
      (event: { transactionId?: string }) => {
        if (event.transactionId) {
          setCategoryChangedIds((prev) =>
            new Set(prev).add(event.transactionId!),
          );
          // Refresh to remove the transaction from the list (category change auto-marks as reviewed)
          setTimeout(() => {
            refresh();
          }, 300); // Small delay to ensure DB update completes
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [refresh]);

  // Listen for event to open review modal after category change (event is emitted after detail modal closes)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "openTransactionReviewModal",
      () => {
        // Short delay then open review modal; use countRef so we have latest count
        setTimeout(() => {
          if (countRef.current > 0) {
            setShowAllModal(true);
          }
        }, 150);
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Initialize slide animations for transactions
  useEffect(() => {
    const newAnimations = new Map<string, Animated.Value>();
    transactions.forEach((tx) => {
      if (!slideAnimations.has(tx.id)) {
        newAnimations.set(tx.id, new Animated.Value(0));
      } else {
        newAnimations.set(tx.id, slideAnimations.get(tx.id)!);
      }
    });
    setSlideAnimations(newAnimations);
  }, [transactions.length]);

  // Show thank you message when all transactions are reviewed
  useEffect(() => {
    if (!loading) {
      const previousCount = previousCountRef.current;

      // If count went from > 0 to 0, show thank you message
      if (previousCount > 0 && count === 0) {
        setShowThankYouMessage(true);

        // Fade in animation
        Animated.sequence([
          Animated.timing(thankYouOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(2000), // Show for 2 seconds
          Animated.timing(thankYouOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowThankYouMessage(false);
        });
      }

      // Update previous count
      previousCountRef.current = count;
    }

    // Reset when transactions appear again
    if (count > 0 && showThankYouMessage) {
      setShowThankYouMessage(false);
      thankYouOpacity.setValue(0);
    }
  }, [loading, count]);

  // Don't render if no unreviewed transactions (unless showing thank you)
  if (!loading && count === 0 && !showThankYouMessage) {
    return null;
  }

  // Show thank you message
  if (showThankYouMessage && count === 0) {
    return (
      <View style={styles.container}>
        <Animated.View
          style={[styles.thankYouContainer, { opacity: thankYouOpacity }]}
        >
          <Text style={styles.thankYouText}>Thanks!</Text>
        </Animated.View>
      </View>
    );
  }

  // Get the first transaction as preview
  const previewTransaction = transactions[0];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const formatAmount = (amount: number) => {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? "+" : "-";
    return `${sign}$${absAmount.toFixed(2)}`;
  };

  const handleTransactionPress = (transaction: UnreviewedTransaction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTransaction(transaction);
    setSelectedTransactionId(transaction.id);
    setShowDetailModal(true);
  };

  const handleMarkAsReviewed = async (
    transactionId: string,
    transaction: UnreviewedTransaction,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Add to animating set
    setAnimatingIds((prev) => new Set(prev).add(transactionId));

    // Get or create animation value
    let animValue = slideAnimations.get(transactionId);
    if (!animValue) {
      animValue = new Animated.Value(0);
      setSlideAnimations((prev) => {
        const next = new Map(prev);
        next.set(transactionId, animValue!);
        return next;
      });
    }

    // Slide right animation
    Animated.spring(animValue, {
      toValue: SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    // Wait for animation
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Mark as reviewed
    await markAsReviewed(transactionId);

    // Reset animation for next use
    setTimeout(() => {
      animValue?.setValue(0);
      setAnimatingIds((prev) => {
        const next = new Set(prev);
        next.delete(transactionId);
        return next;
      });
    }, 100);
  };

  const handleReviewAll = async () => {
    if (transactions.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Add all to animating set
    setAnimatingIds(new Set(transactions.map((tx) => tx.id)));

    // Animate out all transactions
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mark all as reviewed
    await markAllAsReviewed();

    // Clear animating set
    setAnimatingIds(new Set());
  };

  // Don't show anything while loading - load in background
  if (loading) {
    return null;
  }

  if (!previewTransaction) {
    return null;
  }

  // Don't show if category was changed
  if (categoryChangedIds.has(previewTransaction.id)) {
    return null;
  }

  // Convert UnreviewedTransaction to Transaction format (handle null merchant_name)
  const previewTransactionAsTransaction: Transaction = {
    ...previewTransaction,
    merchant_name: previewTransaction.merchant_name ?? undefined,
  };

  const displayCategory = getDisplayCategory(previewTransactionAsTransaction);
  const categoryIcon = getCategoryIcon(displayCategory);
  const categoryColor = getCategoryColor(displayCategory);
  const isAnimating = animatingIds.has(previewTransaction.id);
  const previewSlideAnim =
    slideAnimations.get(previewTransaction.id) || new Animated.Value(0);

  return (
    <>
      <View style={styles.container}>
        {/* First-time message */}
        {showFirstTimeMessage && (
          <View style={styles.firstTimeMessage}>
            <Text style={styles.firstTimeMessageText}>
              Quick check: Confirm categories so we can learn your preferences
              and categorize future transactions automatically.
            </Text>
          </View>
        )}
        <Animated.View
          style={[
            styles.card,
            isAnimating && styles.animating,
            {
              transform: [{ translateX: previewSlideAnim }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Review Transactions</Text>
            </View>
            {count > 1 && (
              <TouchableOpacity
                onPress={handleReviewAll}
                style={styles.reviewAllButton}
                activeOpacity={0.7}
              >
                <Text style={styles.reviewAllText}>Mark all reviewed ✓</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => handleTransactionPress(previewTransaction)}
            activeOpacity={0.8}
            style={styles.transactionCard}
            disabled={isAnimating}
          >
            <View style={styles.transactionLeft}>
              <View style={styles.transactionDetails}>
                <View style={styles.transactionNameRow}>
                  <Text style={styles.transactionName} numberOfLines={1}>
                    {previewTransaction.merchant_name ||
                      previewTransaction.name}
                  </Text>
                </View>
                <View style={styles.transactionMetaRow}>
                  <Text style={styles.transactionDate}>
                    {formatDate(previewTransaction.date)}
                  </Text>
                  <View
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: `${categoryColor}20`,
                        borderColor: `${categoryColor}40`,
                      },
                    ]}
                  >
                    <Text style={styles.categoryChipIcon}>{categoryIcon}</Text>
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: categoryColor },
                      ]}
                    >
                      {formatCategoryName(displayCategory)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text
                style={[
                  styles.transactionAmount,
                  {
                    color:
                      previewTransaction.amount < 0 ? "#4ECDC4" : "#FF6B6B",
                  },
                ]}
              >
                {formatAmount(previewTransaction.amount)}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowAllModal(true)}
            style={styles.viewAllButton}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllText}>
              {count === 1 ? "Review transaction →" : "View all transactions →"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        visible={showDetailModal}
        transactionId={selectedTransactionId}
        transaction={
          selectedTransaction
            ? {
                ...selectedTransaction,
                merchant_name: selectedTransaction.merchant_name ?? undefined,
              }
            : undefined
        }
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransactionId(null);
          setSelectedTransaction(null);
          // Refresh the list when modal closes to remove any reviewed transactions
          refresh();
        }}
      />

      {/* All Transactions Modal */}
      <Modal
        visible={showAllModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAllModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAllModal(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Review Transactions</Text>
                <Text style={styles.modalSubtitle}>
                  Confirm or change the category for each transaction
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAllModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
            >
              {transactions
                .filter((tx) => !categoryChangedIds.has(tx.id))
                .map((transaction) => {
                  // Convert UnreviewedTransaction to Transaction format (handle null merchant_name)
                  const transactionAsTransaction: Transaction = {
                    ...transaction,
                    merchant_name: transaction.merchant_name ?? undefined,
                  };
                  const displayCategory = getDisplayCategory(
                    transactionAsTransaction,
                  );
                  const categoryIcon = getCategoryIcon(displayCategory);
                  const categoryColor = getCategoryColor(displayCategory);
                  const isAnimating = animatingIds.has(transaction.id);
                  const slideAnim =
                    slideAnimations.get(transaction.id) ||
                    new Animated.Value(0);

                  return (
                    <Animated.View
                      key={transaction.id}
                      style={[
                        styles.modalTransactionItem,
                        isAnimating && styles.animating,
                        {
                          transform: [{ translateX: slideAnim }],
                        },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => {
                          setShowAllModal(false);
                          handleTransactionPress(transaction);
                        }}
                        style={styles.modalTransactionTouchable}
                        activeOpacity={0.7}
                      >
                        <View style={styles.modalTransactionLeft}>
                          <View style={styles.modalTransactionDetails}>
                            <View style={styles.modalTransactionNameRow}>
                              <Text
                                style={styles.modalTransactionName}
                                numberOfLines={1}
                              >
                                {transaction.merchant_name || transaction.name}
                              </Text>
                            </View>
                            <View style={styles.modalTransactionMetaRow}>
                              <Text style={styles.modalTransactionDate}>
                                {formatDate(transaction.date)}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.modalTransactionRight}>
                          <Text
                            style={[
                              styles.modalTransactionAmount,
                              {
                                color:
                                  transaction.amount < 0
                                    ? "#4ECDC4"
                                    : "#f78b8b",
                              },
                            ]}
                          >
                            {formatAmount(transaction.amount)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.modalActions}>
                        <View
                          style={[
                            styles.modalCategoryChipLarge,
                            {
                              backgroundColor: `${categoryColor}20`,
                              borderColor: `${categoryColor}40`,
                            },
                          ]}
                        >
                          <Text style={styles.modalCategoryChipIconLarge}>
                            {categoryIcon}
                          </Text>
                          <Text
                            style={[
                              styles.modalCategoryChipTextLarge,
                              { color: categoryColor },
                            ]}
                          >
                            {formatCategoryName(displayCategory)}
                          </Text>
                        </View>
                        <View style={styles.modalActionButtons}>
                          <TouchableOpacity
                            onPress={() => {
                              setShowAllModal(false);
                              handleTransactionPress(transaction);
                            }}
                            style={styles.modalChangeCategoryButton}
                            activeOpacity={0.7}
                            disabled={isAnimating}
                          >
                          <Ionicons
                            name="create-outline"
                            size={14}
                            color="#4A90E2"
                          />
                            <Text style={styles.modalChangeCategoryButtonText}>
                              Change category
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              handleMarkAsReviewed(transaction.id, transaction)
                            }
                            style={styles.modalConfirmButton}
                            activeOpacity={0.7}
                            disabled={isAnimating}
                          >
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color="#4ECDC4"
                            />
                            <Text style={styles.modalConfirmButtonText}>
                              Correct
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
            </ScrollView>
            {transactions.length > 0 && (
              <TouchableOpacity
                onPress={handleReviewAll}
                style={styles.modalReviewAllButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalReviewAllText}>
                  Mark all as reviewed
                </Text>
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    // paddingHorizontal: 20,
    marginBottom: 16,
  },
  firstTimeMessage: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  firstTimeMessageText: {
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255, 255, 255, 0.65)",
    fontWeight: "400",
  },
  card: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  animating: {
    opacity: 0.3,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  reviewAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
  },
  reviewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A90E2",
  },
  transactionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginBottom: 12,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionNameRow: {
    marginBottom: 6,
  },
  transactionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  transactionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  transactionDate: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  categoryChipIcon: {
    fontSize: 12,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  viewAllButton: {
    paddingVertical: 8,
    alignItems: "center",
  },
  viewAllText: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "600",
  },
  cardActions: {
    flexDirection: "row",
    gap: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  cardActionBoxLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
    backgroundColor: "rgba(222, 185, 185, 0.08)",
  },
  cardActionBoxRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
    backgroundColor: "rgba(194, 221, 219, 0.08)",
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  loadingText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 8,
    alignSelf: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 4,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalTransactionNameRow: {
    marginBottom: 6,
  },
  modalTransactionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  modalTransactionDate: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  modalCategoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  modalCategoryChipIcon: {
    fontSize: 11,
  },
  modalCategoryChipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  modalTransactionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  modalTransactionTouchable: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTransactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  modalTransactionDetails: {
    flex: 1,
  },
  modalTransactionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  modalTransactionRight: {
    alignItems: "flex-end",
  },
  modalTransactionAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "column",
    gap: 8,
  },
  modalCategoryChipLarge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  modalCategoryChipIconLarge: {
    fontSize: 13,
  },
  modalCategoryChipTextLarge: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalActionButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  modalChangeCategoryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.35)",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  modalChangeCategoryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4A90E2",
  },
  modalConfirmButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.35)",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  modalConfirmButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4ECDC4",
  },
  modalReviewAllButton: {
    margin: 20,
    padding: 16,
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalReviewAllText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  thankYouContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  thankYouText: {
    fontSize: 18,
    fontWeight: "500",
    color: "#fff",
    opacity: 0.8,
  },
});
